import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTutorDatabase, feedbackFor, USER_A, USER_B, SESSION_A, SESSION_B } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import { CHAT_PERSONA } from '../supabase/functions/english-tutor/persona.mjs';

test('free chat reloads the full owned session, keeps persona in new sessions and preserves reviews, usage and failure details', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  try {
    await pg.exec(await readFile(new URL('../supabase/migrations/202610280001_tutor_expression_review.sql', import.meta.url), 'utf8'));
    const otherSession = randomUUID();
    await pg.query('insert into tutor_sessions(id,user_id,title) values($1,$2,$3)', [otherSession, USER_A, 'Separate']);
    for (let index = 0; index < 10; index++) {
      await pg.query("insert into tutor_turns(id,user_id,session_id,content,input_mode,level,improvements,state,feedback,created_at,usage_day) values($1,$2,$3,$4,'text','A2',false,'completed',$5,$6,'2026-10-01')",
        [randomUUID(), USER_A, SESSION_A, index === 0 ? 'I live in Guri. FIRST_MEMORY' : `Old message ${index}`, feedbackFor(), `2026-10-01T00:${String(index).padStart(2, '0')}:00Z`]);
    }
    for (const [user, session, text] of [[USER_A, otherSession, 'OTHER_SESSION_PRIVATE'], [USER_B, SESSION_B, 'OTHER_ACCOUNT_PRIVATE']]) {
      await pg.query("insert into tutor_turns(id,user_id,session_id,content,input_mode,level,improvements,state,feedback,usage_day) values($1,$2,$3,$4,'text','A2',false,'completed',$5,'2026-10-01')", [randomUUID(), user, session, text, feedbackFor()]);
    }
    let calls = 0, mode = 'normal';
    const requests = [], diagnostics = [];
    const reply = 'You mentioned Guri earlier.\n\n이렇게 말해요: I live in Guri. Where do you like to go there?';
    const handler = createTutorHandler({ createClient: () => client,
      env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', HIVE_API_KEY: 'hive-secret' })[key],
      logDiagnostic: event => diagnostics.push(event),
      fetchImpl: async (_url, options) => {
        calls++; requests.push(JSON.parse(options.body));
        const body = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: mode === 'empty' ? '' : reply }, finish_reason: null }] })}\n\n`
          + 'data: {"choices":[],"usage":{"total_tokens":123}}\n\n'
          + (mode === 'disconnect' ? '' : 'data: [DONE]\n\n');
        return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
      },
    });
    const request = async (body, user = USER_A) => {
      const res = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: res.status, body: await res.json() };
    };
    const resetClock = () => pg.exec("update tutor_usage set last_request_at=now()-interval '10 seconds'");
    const send = (sessionId = SESSION_A) => ({ action: 'send', sessionId, requestId: randomUUID(), content: 'Do you remember my city?', inputMode: 'text' });
    assert.equal((await request(send(SESSION_B))).status, 404);
    assert.equal((await request({ ...send(), messages: [] })).status, 400);
    assert.equal(calls, 0);
    const first = send(), result = await request(first);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.body.turn.feedback.tutor_reply, reply);
    assert.equal(result.body.turn.feedback.response_format, 'free_chat');
    assert.equal(result.body.turn.feedback.memory, undefined);
    const history = requests.at(-1).messages;
    assert.equal(history.length, 22);
    assert.ok(history[0].content.startsWith(CHAT_PERSONA));
    assert.match(history[1].content, /FIRST_MEMORY/);
    assert.doesNotMatch(JSON.stringify(history), /OTHER_SESSION_PRIVATE|OTHER_ACCOUNT_PRIVATE/);
    assert.deepEqual((await request(first)).body.turn, result.body.turn); assert.equal(calls, 1);
    assert.equal((await request({ action: 'session', sessionId: SESSION_A })).body.turns.at(-1).feedback.tutor_reply, reply);
    assert.equal((await request({ action: 'session', sessionId: SESSION_A }, USER_B)).status, 404);
    const saved = await request({ action: 'study-save', turnId: first.requestId, kind: 'reply' });
    assert.equal(saved.status, 200); assert.equal(saved.body.item.phrase.sentence, reply);
    assert.equal((await request({ action: 'study-save', turnId: first.requestId, kind: 'reply' }, USER_B)).status, 404);

    await resetClock();
    await request(send());
    assert.equal(requests.at(-1).messages.at(-3).content, first.content);
    assert.equal(requests.at(-1).messages.at(-2).content, reply, 'reopened sessions use saved assistant text verbatim');
    await resetClock();
    const fresh = (await request({ action: 'create-session', title: 'New conversation' })).body.session;
    await request(send(fresh.id));
    assert.equal(requests.at(-1).messages.length, 2);
    assert.ok(requests.at(-1).messages[0].content.startsWith(CHAT_PERSONA));
    assert.doesNotMatch(JSON.stringify(requests.at(-1)), /FIRST_MEMORY|OTHER_SESSION_PRIVATE/);
    assert.equal((await request({ action: 'bootstrap' })).body.usage.total.tokens, 369);

    for (const [failure, reason] of [['disconnect', 'INCOMPLETE_STREAM'], ['empty', 'EMPTY_REPLY']]) {
      await resetClock(); mode = failure;
      const payload = send(), before = calls;
      assert.deepEqual((await request(payload)).body, { code: 'INVALID_MODEL_OUTPUT', reason });
      const again = await request(payload);
      assert.equal(again.body.turn.state, 'failed');
      assert.equal(again.body.turn.error_code, `INVALID_MODEL_OUTPUT:${reason}`);
      assert.equal(calls, before + 1);
      assert.equal(diagnostics.at(-1).reason, reason);
    }
    assert.doesNotMatch(JSON.stringify(diagnostics), /hive-secret|server-secret|FIRST_MEMORY|Do you remember/);
    assert.equal((await request({ action: 'bootstrap' })).body.usage.total.tokens, 615);
    await pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
    const before = calls; assert.equal((await request(send())).status, 403); assert.equal(calls, before);
  } finally { await close(); }
});
