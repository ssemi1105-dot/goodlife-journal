import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTutorDatabase, feedbackFor, USER_A, USER_B } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import * as japanese from '../supabase/functions/japanese-tutor/core.mjs';

test('both tutors recover complete fenced replies, preserve summary, and diagnose failures without leaking or paying twice', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  try {
    await pg.query('insert into japanese_tutor_access(user_id,enabled) values ($1,true),($2,true)', [USER_A, USER_B]);
    for (const [curriculum, prefix, content, fixture] of [
      [null, 'tutor_', 'I always using the air conditioner.', feedbackFor],
      [japanese, 'japanese_tutor_', '커피 주세요', japaneseFeedback],
    ]) {
      let mode = 'first', calls = 0;
      const diagnostics = [], history = [];
      const handler = createTutorHandler({ createClient: () => client, curriculum, logDiagnostic: entry => diagnostics.push(entry),
        env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', HIVE_API_KEY: 'provider-secret' })[key],
        fetchImpl: async (_url, options) => {
          calls++;
          const messages = JSON.parse(options.body).messages;
          history.push(messages);
          const raw = fixture(messages.at(-1).content);
          raw.memory = mode === 'first' ? 'Previously discussed the weather in this conversation.' : null;
          if (mode === 'first' && !curriculum) raw.tutor_reply = 'Do you usually use the air conditioner or a fan at home?';
          if (mode === 'schema') raw.flags = null;
          if (mode === 'incomplete') return new Response('data: {"choices":[{"index":0,"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
          const text = mode === 'json' ? 'PRIVATE_MODEL_OUTPUT'
            : mode === 'fenced' ? '```json\n' + JSON.stringify(raw) + '\n```' : JSON.stringify(raw);
          return Response.json({ choices: [{ finish_reason: mode === 'limit' ? 'length' : 'stop', message: { content: text } }], usage: { total_tokens: 400 } });
        },
      });
      const request = async (body, user = USER_A) => {
        const response = await handler(new Request('http://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
        return { status: response.status, body: await response.json() };
      };
      const session = (await request({ action: 'create-session', title: 'Response regression' })).body.session;
      const send = (input = content) => ({ action: 'send', sessionId: session.id, requestId: randomUUID(), content: input, inputMode: 'text' });
      assert.equal((await request(send('오늘은 더워요.'))).status, 200);
      await pg.exec(`update ${prefix}usage set last_request_at=now()-interval '10 seconds'`);
      mode = 'fenced';
      const payload = send(), reply = await request(payload);
      assert.equal(reply.status, 200, JSON.stringify(reply));
      assert.equal(reply.body.turn.state, 'completed');
      assert.equal(reply.body.turn.feedback.memory, undefined);
      assert.equal(reply.body.turn.feedback.assessment_eligible, false);
      if (!curriculum) {
        assert.equal(reply.body.turn.feedback.corrected, 'I always use the air conditioner.');
        assert.equal(reply.body.turn.feedback.errors.length, 1);
        assert.ok(JSON.stringify(history.at(-1)).includes('or a fan at home?'));
      } else assert.ok(reply.body.turn.feedback.natural.pronunciation_ko);
      assert.deepEqual((await request(payload)).body.turn.feedback, reply.body.turn.feedback);
      assert.equal(calls, 2);
      const loaded = await request({ action: 'session', sessionId: session.id });
      assert.equal((await pg.query(`select summary from ${prefix}sessions where id=$1`, [session.id])).rows[0].summary, 'Previously discussed the weather in this conversation.');
      assert.equal(loaded.body.turns.length, 2);
      assert.equal((await request({ action: 'session', sessionId: session.id }, USER_B)).status, 404);

      for (const [failure, reason, stage] of [['json', 'INVALID_JSON', 'json'], ['schema', 'SCHEMA_MISMATCH', 'schema'], ['limit', 'OUTPUT_LIMIT', 'provider'], ['incomplete', 'INCOMPLETE_STREAM', 'provider']]) {
        await pg.exec(`update ${prefix}usage set last_request_at=now()-interval '10 seconds'`);
        mode = failure;
        const payload = send(), before = calls;
        const result = await request(payload);
        assert.equal(result.status, 502);
        assert.deepEqual(result.body, { code: 'INVALID_MODEL_OUTPUT', reason });
        assert.equal((await request(payload)).body.turn.state, 'failed');
        assert.equal(calls, before + 1, 'failed requests and status checks never trigger an automatic paid retry');
        assert.deepEqual(diagnostics.at(-1), { event: 'tutor_response_rejected', tutor: curriculum ? 'japanese' : 'english', stage, reason, reported_tokens: failure === 'incomplete' ? null : 400 });
      }
      const bootstrap = await request({ action: 'bootstrap' });
      assert.deepEqual(bootstrap.body.usage.total, { requests: 6, tokens: 2000, unreported: 1 });
      assert.ok(!JSON.stringify(diagnostics).includes(content));
      assert.ok(!JSON.stringify(diagnostics).includes(USER_A));
      assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE_MODEL_OUTPUT'));
      assert.ok(!JSON.stringify(diagnostics).includes('secret'));
    }
  } finally { await close(); }
});
