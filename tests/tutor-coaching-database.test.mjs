import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTutorDatabase, feedbackFor, USER_A, USER_B } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import * as japanese from '../supabase/functions/japanese-tutor/core.mjs';

test('expression tips persist in existing JSONB, enter private review, and reuse the single normal API call', async () => {
  const { pg, client, close } = await createTutorDatabase({ japanese: true });
  try {
    await pg.query('insert into japanese_tutor_access(user_id,enabled) values ($1,true),($2,true)', [USER_A, USER_B]);
    for (const [curriculum, prefix, inputs, fixture] of [
      [null, 'tutor_', ['오늘 회사에서 너무 바빴어.', 'I want to 아내랑 저녁 먹다.'], feedbackFor],
      [japanese, 'japanese_tutor_', ['커피 주세요', 'コーヒーを 두 잔 주세요'], japaneseFeedback],
    ]) {
      let calls = 0;
      const handler = createTutorHandler({ createClient: () => client, curriculum,
        env: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test', HIVE_API_KEY: 'test' })[key],
        fetchImpl: async (_url, options) => {
          calls++;
          const body = JSON.parse(options.body);
          assert.match(body.messages[0].content, /useful reusable pattern in Korean/);
          assert.equal(body.max_completion_tokens, 1400);
          return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(fixture(body.messages.at(-1).content)) } }], usage: { total_tokens: 900 } });
        },
      });
      const request = async (body, user = USER_A) => {
        const response = await handler(new Request('http://fixture.invalid', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
        return { status: response.status, body: await response.json() };
      };
      const session = (await request({ action: 'create-session', title: '표현 연습' })).body.session;
      for (const [index, content] of inputs.entries()) {
        await pg.exec(`update ${prefix}usage set last_request_at=now()-interval '10 seconds'`);
        const payload = { action: 'send', sessionId: session.id, requestId: randomUUID(), content, inputMode: 'text' };
        const reply = await request(payload);
        assert.equal(reply.status, 200, JSON.stringify(reply));
        assert.equal(reply.body.turn.feedback.expression_tips.length, 1);
        assert.equal(reply.body.turn.feedback.assessment_eligible, false);
        assert.equal(reply.body.turn.feedback.memory, undefined);
        assert.deepEqual(reply.body.turn.feedback.errors, []);
        assert.equal(calls, index + 1);
        assert.deepEqual((await request(payload)).body.turn.feedback, reply.body.turn.feedback);
        assert.equal(calls, index + 1, 'replay never pays for another explanation');
        const saved = (await pg.query(`select feedback from ${prefix}turns where id=$1`, [payload.requestId])).rows[0].feedback;
        assert.deepEqual(saved.expression_tips, reply.body.turn.feedback.expression_tips);
        const bootstrap = await request({ action: 'bootstrap' });
        assert.deepEqual(bootstrap.body.review.find(turn => turn.id === payload.requestId).feedback.expression_tips, saved.expression_tips);
        assert.equal(bootstrap.body.usage.total.tokens, (index + 1) * 900);
      }
      const loaded = await request({ action: 'session', sessionId: session.id });
      assert.ok(loaded.body.turns.every(turn => turn.feedback.expression_tips.length === 1));
      assert.equal((await request({ action: 'session', sessionId: session.id }, USER_B)).status, 404);
      assert.deepEqual((await request({ action: 'bootstrap' }, USER_B)).body.review, []);
    }
  } finally { await close(); }
});
