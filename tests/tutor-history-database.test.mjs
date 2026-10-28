import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTutorDatabase, USER_A, USER_B, SESSION_A, SESSION_B } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';

test('history hides empty sessions; first message atomically persists, survives failures and stays owner-only', async () => {
  const { pg, client, close } = await createTutorDatabase();
  let calls = 0, fail = false;
  const handler = createTutorHandler({ createClient: () => client, logDiagnostic() {},
    env: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', HIVE_API_KEY: 'test-only' })[key],
    fetchImpl: async () => { calls++; return fail ? new Response('fail', { status: 503 }) : Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'What did you enjoy today?' } }], usage: { total_tokens: 123 } }); },
  });
  const request = async (body, user = USER_A) => {
    const response = await handler(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const draft = (topicId = null) => ({ action: 'send', sessionId: randomUUID(), requestId: randomUUID(), content: 'I like movies.', inputMode: 'text', draftSession: { topicId } });
  const resetClock = () => pg.exec("update tutor_usage set last_request_at=now()-interval '10 seconds'");
  const history = async (user = USER_A) => (await request({ action: 'bootstrap' }, user)).body.sessions;
  try {
    assert.deepEqual(await history(), []);
    assert.equal((await pg.query('select count(*)::int n from tutor_sessions')).rows[0].n, 2);
    // A user's many pre-update empty topic sessions must not exhaust the real history quota.
    await pg.query("insert into tutor_sessions(user_id,title) select $1,'Old empty' from generate_series(1,50)", [USER_A]);
    assert.deepEqual(await history(), []);
    const first = draft('movies');
    for (const bad of [
      { ...first, content: '' }, { ...first, draftSession: { topicId: 'missing' } },
      { ...first, draftSession: { topicId: 'movies', opening: { question: 'untrusted' } } },
      { ...first, user_id: USER_B },
    ]) assert.equal((await request(bad)).status, 400);
    assert.equal((await request({ ...first, sessionId: SESSION_B })).status, 409);
    assert.equal(calls, 0); assert.deepEqual(await history(), []);
    const result = await request(first);
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(calls, 1);
    const list = await history();
    assert.equal(list.length, 1); assert.equal(list[0].id, first.sessionId);
    assert.equal(list[0].title, '영화·드라마'); assert.equal(list[0].preview, first.content);
    assert.equal(list[0].message_count, 1); assert.ok(list[0].last_message_at);
    assert.deepEqual(await history(USER_B), []);
    assert.equal((await request({ action: 'session', sessionId: first.sessionId }, USER_B)).status, 404);
    assert.equal((await request({ action: 'delete-session', sessionId: first.sessionId }, USER_B)).status, 404);
    assert.deepEqual((await request(first)).body, result.body); assert.equal(calls, 1);
    // The cooldown failure rolls back the new session, not just the new turn.
    const tooSoon = draft();
    assert.equal((await request(tooSoon)).body.code, 'RATE_LIMIT');
    assert.equal((await pg.query('select id from tutor_sessions where id=$1', [tooSoon.sessionId])).rows.length, 0);
    assert.equal(calls, 1);
    await resetClock();
    fail = true;
    const failed = draft();
    assert.equal((await request(failed)).status, 502);
    assert.equal((await request(failed)).body.turn.state, 'failed'); assert.equal(calls, 2);
    const afterFail = await history();
    assert.equal(afterFail[0].id, failed.sessionId); assert.equal(afterFail[0].title, failed.content);
    assert.equal(afterFail[0].message_count, 1); assert.equal(afterFail.length, 2);
    assert.equal((await pg.query('select id from tutor_sessions where id=$1', [SESSION_A])).rows.length, 1);
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
    assert.equal((await request(draft())).status, 403); assert.equal((await request({ action: 'bootstrap' })).status, 403);
    assert.equal(calls, 2);
    // Neither user nor admin browser can directly call the service-only functions.
    await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${USER_A}',false)`);
    await assert.rejects(pg.query('select tutor_session_history($1)', [USER_B]), /permission denied/);
    await assert.rejects(pg.query('select tutor_begin_session_turn($1,$2,$3,$4,$5,$6,$7,$8,$9)', [USER_A, randomUUID(), randomUUID(), 'Hello', 'text', false, 'Title', null, null]), /permission denied/);
    await pg.exec('reset role');
  } finally { await close(); }
});

test('real conversation quota, pending visibility and conflicting first-send rollback', async () => {
  const { pg, client, close } = await createTutorDatabase();
  const args = (id = randomUUID()) => ({ p_user_id: USER_A, p_session_id: id, p_request_id: randomUUID(),
    p_content: 'Hello', p_input_mode: 'text', p_voice_confirmed: false, p_title: 'Hello', p_topic_id: null, p_opening: null });
  try {
    const first = args();
    assert.equal((await client.rpc('tutor_begin_session_turn', first)).data.begin.fresh, true);
    assert.equal((await client.rpc('tutor_session_history', { p_user_id: USER_A })).data[0].id, first.p_session_id);
    assert.equal((await client.rpc('tutor_begin_session_turn', first)).data.begin.fresh, false);
    const next = args();
    assert.match((await client.rpc('tutor_begin_session_turn', next)).error.message, /REQUEST_BUSY/);
    const conflicting = { ...args(), p_request_id: first.p_request_id };
    assert.match((await client.rpc('tutor_begin_session_turn', conflicting)).error.message, /REQUEST_CONFLICT/);
    assert.equal((await pg.query('select id from tutor_sessions where id=any($1::uuid[])', [[next.p_session_id, conflicting.p_session_id]])).rows.length, 0);
    await pg.exec("update tutor_turns set state='failed'; update tutor_usage set last_request_at=now()-interval '10 seconds'");
    await pg.query(`with sessions as (insert into tutor_sessions(user_id,title) select $1,'Saved' from generate_series(1,49) returning id)
      insert into tutor_turns(id,user_id,session_id,content,input_mode,level,improvements,usage_day,state)
      select gen_random_uuid(),$1,id,'Sent','text','A2',false,current_date,'failed' from sessions`, [USER_A]);
    const limited = args();
    assert.match((await client.rpc('tutor_begin_session_turn', limited)).error.message, /TOO_MANY_SESSIONS/);
    assert.equal((await client.rpc('tutor_session_history', { p_user_id: USER_A })).data.length, 50);
    assert.equal((await pg.query('select id from tutor_sessions where id=$1', [limited.p_session_id])).rows.length, 0);
  } finally { await close(); }
});
