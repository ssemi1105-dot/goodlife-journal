import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTutorMessages, cleanTutorFeedback, cleanPhrase, learningSummary } from '../supabase/functions/japanese-tutor/core.mjs';
import { JAPANESE_TOPICS, LEVELS, makeTopicOpening } from '../supabase/functions/japanese-tutor/topics.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';

test('all ten Japanese topics have usable Japanese, kana, Hangul and meaning at every level', () => {
  assert.equal(JAPANESE_TOPICS.length, 10);
  assert.equal(new Set(JAPANESE_TOPICS.map(topic => topic.id)).size, 10);
  for (const topic of JAPANESE_TOPICS) for (const level of LEVELS) {
    const opening = makeTopicOpening(topic.id, level);
    assert.equal(opening.level, level);
    assert.equal(opening.question, cleanPhrase(opening.question_reading).sentence);
    cleanPhrase(opening.example);
    assert.ok(Buffer.byteLength(JSON.stringify(opening)) < 2400);
  }
  assert.equal(makeTopicOpening('unknown'), null);
});

test('Japanese prompts keep Korean reading contract, speaking focus and bounded private context', () => {
  const opening = makeTopicOpening('cafe');
  const messages = buildTutorMessages({ profile: { level: 'starter' }, session: { topic_id: 'cafe', title: '카페', opening, summary: '' },
    turns: Array.from({ length: 6 }, () => ({ content: 'あ'.repeat(1000), feedback: { tutor_reply: 'い'.repeat(600) } })), content: '커피 주세요', inputMode: 'voice' });
  assert.equal(messages[2].content, opening.question);
  assert.equal(messages.at(-1).content, '커피 주세요');
  assert.match(messages[0].content, /approximate Korean phonetic/);
  assert.match(messages[0].content, /no audio is provided/);
  assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= 18000);
});

test('Japanese feedback preserves complete readings and never grades Korean or speech uncertainty', () => {
  const value = cleanTutorFeedback(japaneseFeedback('커피 주세요'), { content: '커피 주세요', inputMode: 'text' });
  assert.match(value.natural.pronunciation_ko, /코오히이/);
  assert.equal(value.reply_reading.sentence, value.tutor_reply);
  assert.equal(value.assessment_eligible, false);
  assert.equal(value.corrected, '커피 주세요');
  for (const flag of ['stt_suspected', 'meaning_unclear', 'sensitive']) {
    const raw = japaneseFeedback('커피'); raw.flags[flag] = true;
    raw.errors = [{ type: 'word_choice', original: '커피', corrected: 'コーヒー', explanation_ko: '오류 아님' }];
    const safe = cleanTutorFeedback(raw, { content: '커피', inputMode: 'voice' });
    assert.equal(safe.natural, null); assert.deepEqual(safe.errors, []);
  }
  assert.equal(learningSummary([{ state: 'completed', feedback: value }]).recommendation, null);
});

test('missing Hangul, mismatched scripts and oversized outputs fail closed', () => {
  const variants = [
    raw => { delete raw.tutor_reply.pronunciation_ko; },
    raw => { raw.tutor_reply.reading_kana = '温かいコーヒーですか。'; },
    raw => { raw.tutor_reply.sentence = '일본어 대신 한국어'; },
    raw => { raw.tutor_reply.pronunciation_ko = 'atatakai coffee'; },
    raw => { raw.tutor_reply.meaning_ko = 'coffee'; },
    raw => { raw.tutor_reply.sentence = 'あ'.repeat(241); },
    raw => { raw.errors = Array(4).fill({}); },
  ];
  for (const mutate of variants) {
    const raw = japaneseFeedback(); mutate(raw);
    assert.throws(() => cleanTutorFeedback(raw, { content: 'コーヒー', inputMode: 'text' }), /INVALID_MODEL_OUTPUT/);
  }
});

test('Japanese corrections are literal, unique and non-overlapping, never hallucinated rewrites', () => {
  const raw = japaneseFeedback();
  raw.errors = [
    { type: 'particle', original: 'が', corrected: 'を', explanation_ko: '먹는 대상을 나타낼 때 を를 씁니다.' },
    { type: 'word_choice', original: '없는 말', corrected: '言葉', explanation_ko: '허위 교정' },
  ];
  const safe = cleanTutorFeedback(raw, { content: 'パンが食べます。', inputMode: 'text' });
  assert.equal(safe.errors.length, 1); assert.equal(safe.corrected, 'パンを食べます。');
  assert.equal(cleanTutorFeedback(raw, { content: 'がが', inputMode: 'text' }).errors.length, 0);
});
