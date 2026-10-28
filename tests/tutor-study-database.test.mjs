import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTutorDatabase, USER_A, USER_B, SESSION_A } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import * as japanese from '../supabase/functions/japanese-tutor/core.mjs';

test('expression review preserves history, separates owner/language, enforces RLS and idempotent schedules without AI calls', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  try {
    const sql = await readFile(new URL('../supabase/migrations/202610280001_tutor_expression_review.sql', import.meta.url), 'utf8');
    await pg.exec(sql); await pg.exec(sql);
    assert.equal((await pg.query('select id from tutor_sessions where id=$1', [SESSION_A])).rows.length, 1);
    await pg.query('insert into japanese_tutor_access(user_id,enabled) values ($1,true),($2,false)', [USER_A, USER_B]);
    let calls = 0;
    const handlers = Object.fromEntries(['en', 'ja'].map(language => [language, createTutorHandler({ createClient: () => client,
      curriculum: language === 'ja' ? japanese : null,
      env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[key],
      fetchImpl: async () => { calls++; throw new Error('Study must not use the paid API'); },
    })]));
    const request = async (language, body, user = USER_A) => {
      const res = await handlers[language](new Request('https://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: res.status, body: await res.json() };
    };
    const payload = { action: 'study-save', topicId: 'cafe', phraseId: '0' };
    assert.equal((await request('en', payload, 'bad-token')).status, 401);
    assert.equal((await request('ja', payload, USER_B)).status, 403);
    assert.equal((await request('en', { ...payload, user_id: USER_B })).status, 400);
    assert.equal((await request('en', { ...payload, phraseId: 'unknown' })).status, 400);
    const en = await request('en', payload), ja = await request('ja', payload);
    assert.equal(en.status, 200, JSON.stringify(en)); assert.equal(ja.status, 200, JSON.stringify(ja));
    assert.notEqual(en.body.item.id, ja.body.item.id);
    assert.equal(en.body.item.user_id, undefined);
    assert.deepEqual((await request('en', payload)).body.item, en.body.item);
    assert.equal((await request('en', { action: 'study-list' })).body.items.length, 1);
    assert.equal((await request('ja', { action: 'study-list' })).body.items.length, 1);
    assert.deepEqual((await request('en', { action: 'study-list' }, USER_B)).body.items, []);
    const grade = { action: 'study-grade', itemId: en.body.item.id, requestId: randomUUID(), grade: 'good' };
    assert.equal((await request('en', grade, USER_B)).status, 404);
    assert.equal((await request('ja', grade)).status, 404);
    const graded = await request('en', grade);
    assert.equal(graded.status, 200, JSON.stringify(graded));
    assert.equal(graded.body.item.repetitions, 1);
    assert.ok(Math.abs(Date.parse(graded.body.item.due_at) - Date.now() - 86400000) < 10000);
    assert.deepEqual((await request('en', grade)).body, graded.body, 'lost response retries do not advance the schedule twice');
    assert.equal((await request('en', { ...grade, grade: 'hard' })).status, 409);
    assert.deepEqual((await request('en', payload)).body.item, graded.body.item, 'saving an existing expression preserves its schedule');
    const again = await request('en', { ...grade, requestId: randomUUID(), grade: 'again' });
    assert.equal(again.body.item.repetitions, 0);
    assert.ok(Math.abs(Date.parse(again.body.item.due_at) - Date.now() - 600000) < 10000);
    assert.equal((await request('en', { action: 'study-save', turnId: randomUUID(), kind: 'reply' })).status, 404);
    await pg.exec(`insert into tutor_study_items(user_id,language,source_key,phrase)
      select '${USER_A}','en','pagination:'||i,jsonb_build_object('sentence','Example '||i) from generate_series(1,1001) i`);
    assert.equal((await request('en', { action: 'study-list' })).body.items.length, 1002);

    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_B]);
    await pg.exec('set role authenticated');
    assert.equal((await pg.query('select * from tutor_study_items')).rows.length, 0);
    assert.equal((await pg.query('select * from tutor_study_reviews')).rows.length, 0);
    await assert.rejects(pg.query('update tutor_study_items set repetitions=6'), /permission denied/);
    await assert.rejects(pg.query('select tutor_study_save($1,$2,$3,$4)', [USER_B, 'en', 'forged', { sentence: 'Forged' }]), /permission denied/);
    await pg.exec('reset role');
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_A]);
    await pg.exec('set role authenticated');
    assert.equal((await pg.query('select * from tutor_study_items')).rows.length, 1003);
    await pg.exec('reset role');
    assert.equal((await request('en', { action: 'study-delete', itemId: en.body.item.id }, USER_B)).status, 200);
    assert.equal((await pg.query('select id from tutor_study_items where id=$1', [en.body.item.id])).rows.length, 1, 'other accounts cannot delete an expression');
    assert.equal((await request('ja', { action: 'study-delete', itemId: en.body.item.id })).status, 200);
    assert.equal((await pg.query('select id from tutor_study_items where id=$1', [en.body.item.id])).rows.length, 1, 'other language cannot delete an expression');
    assert.equal((await request('en', { action: 'study-delete', itemId: en.body.item.id })).status, 200);
    assert.equal((await pg.query('select id from tutor_study_reviews where item_id=$1', [en.body.item.id])).rows.length, 0);
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
    assert.equal((await request('en', { action: 'study-list' })).status, 403);
    assert.equal(calls, 0);
  } finally { await close(); }
});

test('compact replies, optional aids and usage persist for both languages with one paid request per turn', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  try {
    await pg.query('insert into japanese_tutor_access(user_id,enabled) values ($1,true)', [USER_A]);
    for (const language of ['en', 'ja']) {
      let calls = 0;
      const handler = createTutorHandler({ createClient: () => client, curriculum: language === 'ja' ? japanese : null,
        env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test', HIVE_API_KEY: 'test' })[key],
        fetchImpl: async () => { calls++; return Response.json({ choices: [{ finish_reason: 'stop', message: { content: language === 'ja' ? JSON.stringify({ reply: { sentence: '何を飲みますか。' }, practice: { sentence: 23 } }) : 'What would you like to drink?' } }], usage: { total_tokens: 125 } }); },
      });
      const request = async body => {
        const response = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${USER_A}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
        const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
      };
      const { session } = await request({ action: 'create-session', title: 'Compact response' });
      const payload = { action: 'send', sessionId: session.id, requestId: randomUUID(), content: '커피 주세요', inputMode: 'text' };
      const { turn } = await request(payload);
      assert.equal(turn.state, 'completed');
      if (language === 'ja') assert.equal(turn.feedback.coaching_status, 'partial');
      else assert.equal(turn.feedback.response_format, 'free_chat');
      assert.equal(turn.feedback.assessment_eligible, false); assert.equal(turn.feedback.natural, null);
      assert.deepEqual((await request(payload)).turn, turn);
      const snapshot = await request({ action: 'bootstrap' });
      assert.equal(snapshot.usage.total.tokens, 125); assert.equal(snapshot.usage.total.requests, 1);
      assert.equal(calls, 1);
    }
  } finally { await close(); }
});
