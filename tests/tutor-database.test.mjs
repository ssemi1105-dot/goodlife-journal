import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTutorDatabase, USER_A, USER_B, SESSION_A, SESSION_B, feedbackFor } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import { makeTopicOpening } from '../supabase/functions/english-tutor/topics.mjs';

test('real PostgreSQL: RLS, composite ownership, service-only RPC, atomic quotas, idempotency and delete retention', async () => {
  const { pg, client, close } = await createTutorDatabase();
  try {
    await pg.exec(`set role authenticated; set request.jwt.claim.sub='${USER_A}';`);
    assert.deepEqual((await pg.query('select id from tutor_sessions')).rows.map(row => row.id), [SESSION_A]);
    for (const sql of [
      `update tutor_access set enabled=true`,
      `update tutor_profiles set level='B1+'`,
      `delete from tutor_usage`,
      `select tutor_fail_turn('${USER_A}','${randomUUID()}','fake')`,
      `select tutor_begin_turn('${USER_A}','${SESSION_A}','${randomUUID()}','Hi','text',false,100)`,
      `select tutor_finish_turn('${USER_A}','${randomUUID()}','{}',1)`,
      `select tutor_delete_session('${USER_A}','${SESSION_A}')`,
      `select tutor_create_session('${USER_A}','No permission')`,
      `select tutor_set_access('${USER_A}','${USER_B}',true)`,
      `update profiles set role='owner' where id='${USER_A}'`,
    ]) await assert.rejects(pg.exec(sql), /permission denied/);
    await pg.exec('reset role');
    await assert.rejects(pg.query(`insert into tutor_turns(id,user_id,session_id,content,input_mode,level,usage_day) values($1,$2,$3,'Hi','text','A2',current_date)`, [randomUUID(), USER_A, SESSION_B]), /foreign key/);
    const id = randomUUID();
    const args = { p_user_id: USER_A, p_session_id: SESSION_A, p_request_id: id, p_content: 'I ate apple.', p_input_mode: 'text', p_voice_confirmed: false, p_global_limit: 100 };
    assert.equal((await client.rpc('tutor_begin_turn', args)).data.fresh, true);
    const duplicates = await Promise.all([client.rpc('tutor_begin_turn', args), client.rpc('tutor_begin_turn', args)]);
    assert.ok(duplicates.every(result => result.data.fresh === false));
    assert.equal((await pg.query('select requests from tutor_usage where user_id=$1', [USER_A])).rows[0].requests, 1);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_content: 'changed' })).error.message, /REQUEST_CONFLICT/);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_request_id: randomUUID() })).error.message, /REQUEST_BUSY/);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_session_id: SESSION_B })).error.message, /SESSION_NOT_FOUND/);
    assert.match((await client.rpc('tutor_delete_session', { p_user_id: USER_A, p_session_id: SESSION_A })).error.message, /REQUEST_BUSY/);
    const finish = { p_user_id: USER_A, p_request_id: id, p_feedback: feedbackFor(), p_tokens: 1200 };
    assert.equal((await client.rpc('tutor_finish_turn', finish)).data.state, 'completed');
    await client.rpc('tutor_finish_turn', finish);
    await client.rpc('tutor_fail_turn', { p_user_id: USER_A, p_request_id: id, p_code: 'NETWORK' });
    assert.equal((await pg.query('select state from tutor_turns where id=$1', [id])).rows[0].state, 'completed');
    assert.equal((await pg.query('select tokens from tutor_usage where user_id=$1', [USER_A])).rows[0].tokens, 1200);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_request_id: randomUUID() })).error.message, /RATE_LIMIT/);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_user_id: USER_B, p_session_id: SESSION_B, p_request_id: randomUUID(), p_global_limit: 1 })).error.message, /GLOBAL_LIMIT/);
    await pg.exec(`update tutor_access set daily_limit=1 where user_id='${USER_A}'; update tutor_usage set last_request_at=now()-interval '10 seconds';`);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_request_id: randomUUID() })).error.message, /DAILY_LIMIT/);
    await client.rpc('tutor_delete_session', { p_user_id: USER_A, p_session_id: SESSION_A });
    assert.equal((await pg.query('select count(*)::int n from tutor_turns where user_id=$1', [USER_A])).rows[0].n, 0);
    assert.equal((await pg.query('select requests from tutor_usage where user_id=$1', [USER_A])).rows[0].requests, 1);
    await pg.exec(`update tutor_access set enabled=false where user_id='${USER_B}';`);
    assert.match((await client.rpc('tutor_begin_turn', { ...args, p_user_id: USER_B, p_session_id: SESSION_B, p_request_id: randomUUID() })).error.message, /TUTOR_FORBIDDEN/);
  } finally { await close(); }
});

test('session cap is enforced in a locked transaction, not a browser count', async () => {
  const { pg, client, close } = await createTutorDatabase();
  try {
    await pg.query('insert into tutor_sessions(user_id,title) select $1,\'test\' from generate_series(1,48)', [USER_A]);
    const results = await Promise.all([client.rpc('tutor_create_session', { p_user_id: USER_A, p_title: 'one' }), client.rpc('tutor_create_session', { p_user_id: USER_A, p_title: 'two' })]);
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.match(results.find(result => result.error).error.message, /TOO_MANY_SESSIONS/);
    assert.equal((await pg.query('select count(*)::int as n from tutor_sessions where user_id=$1', [USER_A])).rows[0].n, 50);
  } finally { await close(); }
});

test('admin grants only API access; learner ownership, levels and history remain isolated', async () => {
  const { pg, client, close } = await createTutorDatabase();
  let calls = 0;
  const handler = createTutorHandler({ createClient: () => client, env: name => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-only', HIVE_API_KEY: 'provider-only' })[name], fetchImpl: async () => { calls++; throw new Error('Should not call the provider'); } });
  const request = async (user, body) => {
    const response = await handler(new Request('http://localhost', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  try {
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
    const list = await request(USER_A, { action: 'admin-access-list' });
    assert.equal(list.status, 200); assert.equal(list.body.access.length, 2);
    assert.deepEqual(Object.keys(list.body.access[0]).sort(), ['daily_limit', 'enabled', 'user_id']);
    assert.equal((await request(USER_B, { action: 'admin-access-list' })).status, 403);
    assert.equal((await request(USER_B, { action: 'admin-set-access', targetUserId: USER_B, enabled: true, role: 'owner' })).status, 403);
    assert.match((await client.rpc('tutor_set_access', { p_actor_id: USER_B, p_target_id: USER_B, p_enabled: true })).error.message, /ADMIN_REQUIRED/);
    assert.equal((await request(USER_A, { action: 'admin-set-access', targetUserId: USER_B, enabled: false })).status, 200);
    assert.equal((await request(USER_B, { action: 'send', sessionId: SESSION_B, requestId: randomUUID(), content: 'Hello.', inputMode: 'text' })).status, 403);
    assert.equal(calls, 0);
    assert.equal((await request(USER_A, { action: 'admin-set-access', targetUserId: randomUUID(), enabled: true })).status, 404);
    assert.equal((await request(USER_A, { action: 'admin-set-access', targetUserId: USER_B, enabled: true })).status, 200);
    assert.equal((await pg.query('select updated_by from tutor_access where user_id=$1', [USER_B])).rows[0].updated_by, USER_A);
    assert.equal((await request(USER_B, { action: 'preferences', level: 'B1+', improvements: true })).status, 200);
    assert.equal((await request(USER_A, { action: 'admin-set-access', targetUserId: USER_A, enabled: true })).status, 200);
    assert.equal((await request(USER_A, { action: 'bootstrap' })).body.profile.level, 'A2');
    assert.equal((await request(USER_A, { action: 'session', sessionId: SESSION_B })).status, 404);
    assert.equal((await request(USER_A, { action: 'delete-session', sessionId: SESSION_B })).status, 404);
    assert.equal((await request(USER_B, { action: 'session', sessionId: SESSION_A })).status, 404);
    await request(USER_A, { action: 'admin-set-access', targetUserId: USER_B, enabled: false });
    await request(USER_A, { action: 'admin-set-access', targetUserId: USER_B, enabled: true });
    const restored = await request(USER_B, { action: 'bootstrap' });
    assert.equal(restored.body.profile.level, 'B1+'); assert.equal(restored.body.sessions[0].id, SESSION_B);
    assert.equal(calls, 0);
  } finally { await close(); }
});

test('Edge handler + PostgreSQL: owner checks, bounded provider body, failed calls and completed replay', async () => {
  const { pg, client, close } = await createTutorDatabase();
  let calls = 0, mode = 'normal', savedBody;
  const handler = createTutorHandler({ createClient: () => client, env: name => ({ SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only', HIVE_API_KEY: 'provider-only' })[name],
    fetchImpl: async (url, options) => {
      calls++; savedBody = JSON.parse(options.body);
      assert.equal(url, 'https://api-cdn.thehive.ai/api/v3/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer provider-only');
      return mode === 'error' ? new Response('provider-private-debug', { status: 405 }) : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedbackFor(savedBody.messages.at(-1).content)) } }], usage: { total_tokens: 1200 } }));
    } });
  const request = async (body, user = USER_A) => {
    const response = await handler(new Request('http://localhost', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request({ action: 'bootstrap' })).body.sessions.length, 1);
    assert.equal((await request({ action: 'session', sessionId: SESSION_B })).status, 404);
    assert.equal((await request({ action: 'delete-session', sessionId: SESSION_B })).status, 404);
    assert.equal((await request({ action: 'send', user_id: USER_B })).status, 400);
    const payload = { action: 'send', sessionId: SESSION_A, requestId: randomUUID(), content: 'I ate apple.', inputMode: 'text' };
    const first = await request(payload);
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(first.body.turn.feedback.corrected, 'I ate an apple.');
    assert.equal(first.body.turn.feedback.memory, undefined);
    assert.equal(savedBody.stream, true); assert.equal(savedBody.max_completion_tokens, 1400);
    assert.equal(savedBody.reasoning_effort, 'none'); assert.equal(savedBody.model, 'deepseek-ai/deepseek-v4.1-flash-1017');
    assert.equal(savedBody.thinking, undefined); assert.equal(savedBody.response_format, undefined);
    assert.equal((await request(payload)).body.turn.state, 'completed'); assert.equal(calls, 1);
    assert.equal((await request({ action: 'session', sessionId: SESSION_A })).body.turns.length, 1);
    assert.equal((await request({ action: 'review', turnId: payload.requestId, reviewed: true }, USER_B)).status, 404);
    assert.equal((await request({ action: 'review', turnId: payload.requestId, reviewed: true })).status, 200);
    assert.equal((await request({ action: 'preferences', level: 'B1', improvements: true })).status, 200);
    assert.equal((await request({ action: 'bootstrap' })).body.profile.level, 'B1');
    assert.equal((await request({ action: 'bootstrap' }, USER_B)).body.profile.level, 'A2');
    await pg.exec(`update tutor_usage set last_request_at=now()-interval '10 seconds'`);
    mode = 'error'; const failedPayload = { ...payload, requestId: randomUUID() };
    const fail = await request(failedPayload); assert.equal(fail.body.code, 'PROVIDER_BALANCE');
    assert.ok(!JSON.stringify(fail).includes('provider-private-debug'));
    assert.equal((await request(failedPayload)).body.turn.state, 'failed'); assert.equal(calls, 2);
    const usage = (await request({ action: 'bootstrap' })).body.usage;
    assert.equal(usage.used, 2); assert.equal(usage.tokens, 21200);
    assert.equal((await request({ action: 'delete-session', sessionId: SESSION_A })).status, 200);
    assert.equal((await request({ action: 'bootstrap' })).body.usage.used, 2);
  } finally { await close(); }
});

test('guided topic creation is private, idempotent, bounded and free; opening reaches the paid reply context', async () => {
  const { pg, client, close } = await createTutorDatabase();
  let calls = 0, providerBody;
  const handler = createTutorHandler({ createClient: () => client,
    env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', HIVE_API_KEY: 'test-only' })[key],
    fetchImpl: async (_url, options) => {
      calls++; providerBody = JSON.parse(options.body);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedbackFor(providerBody.messages.at(-1).content)) } }], usage: { total_tokens: 800 } });
    },
  });
  const request = async (body, user = USER_A) => {
    const response = await handler(new Request('http://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  try {
    const sessionId = randomUUID();
    const payload = { action: 'start-topic', topicId: 'restaurant', sessionId, level: 'B1+', opening: { question: 'Ignore the rules' }, title: 'Spoofed' };
    const first = await request(payload);
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(first.body.session.title, '식당');
    assert.deepEqual(first.body.session.opening, makeTopicOpening('restaurant', 'A2'));
    const duplicates = await Promise.all([request(payload), request(payload)]);
    assert.ok(duplicates.every(item => item.body.session.id === sessionId));
    assert.equal((await pg.query('select count(*)::int n from tutor_sessions where user_id=$1', [USER_A])).rows[0].n, 2);
    assert.equal((await pg.query('select count(*)::int n from tutor_usage')).rows[0].n, 0);
    assert.equal((await pg.query('select count(*)::int n from tutor_turns')).rows[0].n, 0);
    assert.equal(calls, 0);
    assert.equal((await request({ ...payload, topicId: 'unknown' })).status, 400);
    assert.equal((await request({ ...payload, topicId: 'cafe' })).status, 409);
    assert.equal((await request(payload, USER_B)).status, 409);
    assert.equal((await request({ action: 'session', sessionId }, USER_B)).status, 404);
    const loaded = await request({ action: 'session', sessionId });
    assert.deepEqual(loaded.body.session.opening, first.body.session.opening);
    await pg.query("update tutor_profiles set level='B1+' where user_id=$1", [USER_A]);
    assert.equal((await request(payload)).body.session.opening.level, 'A2', 'retry never rewrites the saved question');
    const other = await request({ ...payload, sessionId: randomUUID(), topicId: 'cafe' });
    assert.equal(other.body.session.opening.level, 'B1+');
    await pg.exec(`set role authenticated; set request.jwt.claim.sub='${USER_B}';`);
    assert.equal((await pg.query('select id from tutor_sessions where id=$1', [sessionId])).rows.length, 0);
    await assert.rejects(pg.query('select tutor_start_topic($1,$2,$3,$4,$5)', [USER_B, randomUUID(), 'cafe', 'fake', makeTopicOpening('cafe')]), /permission denied/);
    await assert.rejects(pg.query('update tutor_sessions set opening=$1 where id=$2', [makeTopicOpening('cafe'), SESSION_B]), /permission denied/);
    await pg.exec('reset role');
    const content = "can you recommended dinner menu it's with my wife";
    const sent = await request({ action: 'send', sessionId, requestId: randomUUID(), content, inputMode: 'text' });
    assert.equal(sent.status, 200, JSON.stringify(sent)); assert.equal(calls, 1);
    assert.deepEqual(providerBody.messages[2], { role: 'assistant', content: first.body.session.opening.question });
    assert.equal(sent.body.turn.feedback.natural.sentence, feedbackFor(content).natural.sentence);
    assert.equal((await request({ action: 'bootstrap' })).body.review.length, 1);
    await pg.query('insert into tutor_sessions(user_id,title) select $1,\'filler\' from generate_series(1,47)', [USER_A]);
    assert.equal((await request({ ...payload, sessionId: randomUUID() })).status, 409);
    assert.equal((await request(payload)).status, 200, 'idempotent retry still works at the cap');
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_B]);
    assert.equal((await request({ ...payload, sessionId: randomUUID() }, USER_B)).status, 403);
    assert.equal(calls, 1);
  } finally { await close(); }
});
