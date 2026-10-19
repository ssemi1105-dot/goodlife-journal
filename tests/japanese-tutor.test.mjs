import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTutorMessages, cleanTutorFeedback, cleanPhrase, learningSummary } from '../supabase/functions/japanese-tutor/core.mjs';
import { JAPANESE_TOPICS, LEVELS, makeTopicOpening } from '../supabase/functions/japanese-tutor/topics.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { TUTOR_PERSONA } from '../supabase/functions/japanese-tutor/persona.mjs';

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

test('Korean and mixed Japanese coaching keeps original Japanese, complete readings, and ungraded Korean gaps', () => {
  for (const content of ['커피 주세요', 'コーヒーを 두 잔 주세요']) {
    const result = cleanTutorFeedback(japaneseFeedback(content), { content, inputMode: 'text', level: 'starter' });
    assert.equal(result.corrected, content);
    assert.equal(result.flags.korean_input, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.expression_tips.length, 1);
    cleanPhrase(result.expression_tips[0]);
    assert.ok(result.natural.sentence.includes(result.expression_tips[0].sentence));
    assert.equal(result.assessment_eligible, false);
  }
  const mixed = cleanTutorFeedback(japaneseFeedback('コーヒーを 두 잔 주세요'), { content: 'コーヒーを 두 잔 주세요', inputMode: 'text' });
  assert.equal(mixed.natural.sentence, 'コーヒーを二杯ください。');
  assert.equal(mixed.expression_tips[0].pronunciation_ko, '니하이');
});

test('Japanese tips remain compatible, bounded and absent for Japanese-only or unclear pronunciation input', () => {
  const content = '커피 주세요', raw = japaneseFeedback(content);
  const legacy = { ...raw }; delete legacy.expression_tips;
  assert.deepEqual(cleanTutorFeedback(legacy, { content, inputMode: 'text' }).expression_tips, []);
  for (const flag of ['stt_suspected', 'meaning_unclear', 'sensitive']) {
    const result = cleanTutorFeedback({ ...raw, flags: { ...raw.flags, [flag]: true } }, { content, inputMode: 'voice' });
    assert.equal(result.natural, null); assert.deepEqual(result.expression_tips, []);
  }
  const missingReading = structuredClone(raw); delete missingReading.expression_tips[0].pronunciation_ko;
  assert.throws(() => cleanTutorFeedback(missingReading, { content, inputMode: 'text' }), /INVALID_MODEL_OUTPUT/);
  assert.throws(() => cleanTutorFeedback({ ...raw, expression_tips: Array(3).fill(raw.expression_tips[0]) }, { content, inputMode: 'text' }), /INVALID_MODEL_OUTPUT/);
  assert.deepEqual(cleanTutorFeedback({ ...raw, expression_tips: [{ ...raw.expression_tips[0], source: '없는 원문' }] }, { content, inputMode: 'text' }).expression_tips, []);
  assert.deepEqual(cleanTutorFeedback(raw, { content: 'コーヒーをください。', inputMode: 'text' }).expression_tips, []);
});

test('Haru persona reaches every level and topic with short optional practice and all reading safeguards', () => {
  for (const level of LEVELS) for (const topic of [null, ...JAPANESE_TOPICS]) {
    const session = { title: topic?.label || '일상', topic_id: topic?.id, opening: topic && makeTopicOpening(topic.id, level), summary: '가'.repeat(600) };
    const messages = buildTutorMessages({ profile: { level }, session, turns: [], content: '나'.repeat(1000), inputMode: 'voice' });
    const system = messages[0].content;
    assert.ok(system.includes(TUTOR_PERSONA));
    assert.match(system, /adult-to-adult speaking coach/);
    assert.match(system, /without a new question in the same turn/);
    assert.match(system, /continue without demanding another retry/);
    assert.match(system, /follow that intent instead/);
    assert.match(system, /approximate Korean phonetic/);
    assert.match(system, /no audio is provided/);
    assert.match(system, /Do not automatically raise level/);
    assert.equal(messages.filter(message => message.role === 'system').length, 1);
    assert.equal(messages.at(-1).content, '나'.repeat(1000));
    assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= 18000);
  }
});

test('Haru receives the actual practice phrase and unchanged inputs for retry, skipping, explanation and goodbye', () => {
  const reference = 'コーヒーをください。';
  const turns = [{ content: '커피 주세요', feedback: { natural: { sentence: reference }, tutor_reply: '一度言ってみませんか。' } }];
  for (const content of [reference, 'コーヒーをお願いします。', '설명해줘', '다음으로 넘어가자', 'さようなら。']) {
    const messages = buildTutorMessages({ profile: { level: 'starter' }, session: { title: '카페', unrelatedJournal: 'PRIVATE_JOURNAL' }, turns, content, inputMode: 'text' });
    const prior = JSON.parse(messages.at(-2).content);
    assert.equal(prior.reference, reference);
    assert.equal(prior.reply, turns[0].feedback.tutor_reply);
    assert.equal(messages.at(-1).content, content);
    assert.match(messages[0].content, /accept a correct equivalent rather than exact copying/);
    assert.match(messages[0].content, /Never claim to hear pronunciation, remember another session/);
    assert.ok(!JSON.stringify(messages).includes('PRIVATE_JOURNAL'));
  }
});

test('Japanese reply survives absent optional memory but not missing required readings or safety flags', () => {
  const content = '커피 주세요', raw = japaneseFeedback(content);
  for (const memory of [null, undefined, {}, 'x'.repeat(601)]) {
    const result = cleanTutorFeedback({ ...raw, memory }, { content, inputMode: 'text' });
    assert.equal(result.memory, null);
    assert.equal(result.tutor_reply, raw.tutor_reply.sentence);
    assert.equal(result.natural.pronunciation_ko, raw.natural.pronunciation_ko);
  }
  const incomplete = structuredClone(raw); delete incomplete.tutor_reply.pronunciation_ko;
  assert.throws(() => cleanTutorFeedback(incomplete, { content, inputMode: 'text' }), /INVALID_MODEL_OUTPUT/);
  assert.throws(() => cleanTutorFeedback({ ...raw, flags: null }, { content, inputMode: 'text' }), /INVALID_MODEL_OUTPUT/);
});
