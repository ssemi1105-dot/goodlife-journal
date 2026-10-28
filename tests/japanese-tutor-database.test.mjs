import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTutorDatabase, USER_A, USER_B, SESSION_A } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import * as curriculum from '../supabase/functions/japanese-tutor/core.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';

test('Japanese tutor: default deny, isolated permissions/history/levels, RLS, usage and replay', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  let calls = 0, providerBody;
  const handler = createTutorHandler({ createClient: () => client, curriculum,
    env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test', HIVE_API_KEY: 'test' })[key],
    fetchImpl: async (_url, options) => { calls++; providerBody = JSON.parse(options.body); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(japaneseFeedback(providerBody.messages.at(-1).content)) } }], usage: { total_tokens: 700 } }); },
  });
  const request = async (body, user = USER_A) => {
    const response = await handler(new Request('http://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request({ action: 'bootstrap' })).status, 403, 'English access does not authorize Japanese');
    assert.equal((await request({ action: 'admin-set-access', targetUserId: USER_B, enabled: true }, USER_B)).status, 403);
    for (const id of [USER_A, USER_B]) assert.equal((await request({ action: 'admin-set-access', targetUserId: id, enabled: true })).status, 200);
    const first = await request({ action: 'bootstrap' });
    assert.equal(first.body.profile.level, 'starter'); assert.deepEqual(first.body.sessions, []);
    const id = randomUUID();
    const start = { action: 'start-topic', sessionId: id, topicId: 'cafe', level: 'conversation', opening: { question: 'spoofed' } };
    const opened = await request(start);
    assert.equal(opened.status, 200, JSON.stringify(opened));
    assert.equal(opened.body.session.opening.level, 'starter');
    assert.equal(opened.body.session.opening.question_reading.pronunciation_ko, '나니오 노미마스카.');
    assert.equal((await request(start)).body.session.id, id); assert.equal(calls, 0);
    assert.equal((await request({ action: 'session', sessionId: SESSION_A })).status, 404, 'English conversation cannot enter Japanese context');
    assert.equal((await request({ action: 'session', sessionId: id }, USER_B)).status, 404);
    assert.equal((await request({ action: 'preferences', level: 'A2', improvements: false })).status, 400);
    assert.equal((await request({ action: 'preferences', level: 'beginner', improvements: false })).status, 200);
    assert.equal((await pg.query('select level from tutor_profiles where user_id=$1', [USER_A])).rows[0].level, 'A2');
    assert.equal((await request({ action: 'bootstrap' }, USER_B)).body.profile.level, 'starter');
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
    const send = { action: 'send', sessionId: id, requestId: randomUUID(), content: '커피 주세요', inputMode: 'voice', voiceConfirmed: true };
    const answer = await request(send);
    assert.equal(answer.status, 200, JSON.stringify(answer));
    assert.equal(answer.body.turn.feedback.natural.pronunciation_ko, '코오히이오 히토츠 쿠다사이.');
    assert.equal(answer.body.turn.feedback.memory, undefined);
    assert.match(providerBody.messages[0].content, /Japanese at beginner level/);
    assert.equal(providerBody.messages[2].content, opened.body.session.opening.question);
    assert.equal((await request(send)).body.turn.state, 'completed'); assert.equal(calls, 1);
    const usage = (await request({ action: 'bootstrap' })).body.usage;
    assert.deepEqual(usage.total, { requests: 1, tokens: 700, unreported: 0 });
    assert.equal((await pg.query('select count(*)::int n from tutor_usage')).rows[0].n, 0);
    assert.equal((await request({ action: 'bootstrap' }, USER_B)).body.usage.total.tokens, 0);
    const admin = await request({ action: 'admin-access-list' });
    assert.equal(admin.body.usage.users.find(row => row.user_id === USER_A).total.tokens, 700);
    assert.equal((await request({ action: 'admin-access-list' }, USER_B)).status, 403);
    await pg.exec(`set role authenticated; set request.jwt.claim.sub='${USER_B}';`);
    assert.equal((await pg.query('select * from japanese_tutor_turns')).rows.length, 0);
    assert.equal((await pg.query('select * from japanese_tutor_usage')).rows.length, 0);
    await assert.rejects(pg.query('select japanese_tutor_set_access($1,$2,true)', [USER_B, USER_B]), /permission denied/);
    await assert.rejects(pg.query('select japanese_tutor_usage_summary($1,true)', [USER_A]), /permission denied/);
    await assert.rejects(pg.exec('update japanese_tutor_usage set reported_tokens=0'), /permission denied/);
    await pg.exec('reset role');
    assert.equal((await request({ action: 'delete-session', sessionId: id }, USER_B)).status, 404);
    assert.equal((await request({ action: 'delete-session', sessionId: id })).status, 200);
    assert.equal((await request({ action: 'bootstrap' })).body.usage.total.tokens, 700);
    assert.equal((await pg.query('select count(*)::int n from tutor_sessions')).rows[0].n, 2, 'English sessions untouched');
    assert.equal((await request({ action: 'bootstrap' }, 'invalid')).status, 401);
    assert.equal((await request({ action: 'send', user_id: USER_B })).status, 400);
  } finally { await close(); }
});
