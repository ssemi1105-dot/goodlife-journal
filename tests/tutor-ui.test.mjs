import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { feedbackFor } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { cleanTutorFeedback as cleanEnglish } from '../supabase/functions/english-tutor/core.mjs';
import { cleanTutorFeedback as cleanJapanese } from '../supabase/functions/japanese-tutor/core.mjs';

let server, Feedback, Topics, Usage, totalUsage, JapanesePhrase, Composer, JapaneseFeedback, Header;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
  Feedback = (await server.ssrLoadModule('/src/components/TutorFeedback.jsx')).default;
  Topics = (await server.ssrLoadModule('/src/components/TutorTopics.jsx')).default;
  const usage = await server.ssrLoadModule('/src/components/TutorUsageSummary.jsx');
  Usage = usage.default; totalUsage = usage.totalTutorUsage;
  JapanesePhrase = (await server.ssrLoadModule('/src/components/JapanesePhrase.jsx')).default;
  Composer = (await server.ssrLoadModule('/src/components/TutorComposer.jsx')).default;
  JapaneseFeedback = (await server.ssrLoadModule('/src/components/JapaneseFeedback.jsx')).default;
  Header = (await server.ssrLoadModule('/src/components/TutorHeader.jsx')).default;
});
after(async () => { await server?.close(); });

test('shared header exposes topic change only in a ready conversation and respects pending work', () => {
  let calls = 0;
  const props = { title: '영어 튜터', subtitle: 'Mina · A2', tab: 'chat', ready: true,
    tabs: [['chat', '대화'], ['review', '복습']], onChooseTopic() { calls++; }, children: () => null };
  const render = overrides => renderToStaticMarkup(createElement(Header, { ...props, ...overrides }));
  assert.match(render(), /class="tutor-topic-trigger" aria-expanded="false"/);
  assert.match(render({ topicsOpen: true, topicDisabled: true }), /aria-expanded="true" disabled=""/);
  assert.doesNotMatch(render({ ready: false }), /tutor-topic-trigger|tutor-menu-trigger/);
  assert.doesNotMatch(render({ tab: 'review' }), /tutor-topic-trigger/);
  assert.equal(calls, 0);
});

test('failed reply messages describe the actual lost response, safe reasons and additional retry cost', async () => {
  const { tutorErrorMessage } = await server.ssrLoadModule('/src/services/tutorClient.js');
  assert.match(tutorErrorMessage('INVALID_MODEL_OUTPUT'), /교정과 응답을 저장하지 못했습니다/);
  assert.match(tutorErrorMessage('INVALID_MODEL_OUTPUT'), /추가 비용/);
  assert.doesNotMatch(tutorErrorMessage('INVALID_MODEL_OUTPUT'), /학습 평가에 반영하지/);
  assert.match(tutorErrorMessage('INVALID_MODEL_OUTPUT', 'OUTPUT_LIMIT'), /길이 제한/);
  assert.match(tutorErrorMessage('INVALID_MODEL_OUTPUT', 'SCHEMA_MISMATCH'), /필요한 교정 정보/);
  assert.equal(tutorErrorMessage('INVALID_MODEL_OUTPUT', '<script>secret</script>'), tutorErrorMessage('INVALID_MODEL_OUTPUT'));
  assert.equal(tutorErrorMessage('UNAUTHORIZED', 'OUTPUT_LIMIT'), tutorErrorMessage('UNAUTHORIZED'));
});

test('recovered short answer visibly presents the correction and tutor follow-up instead of a failed turn', () => {
  const content = 'I always using the air conditioner.';
  const feedback = cleanEnglish(feedbackFor(content), { content, inputMode: 'text', level: 'A2', improvements: false });
  const html = renderToStaticMarkup(createElement(Feedback, { feedback, onSpeak() {}, onPractice() {} }));
  assert.match(html, /I always use the air conditioner/);
  assert.match(html, /What temperature do you usually set it to/);
  assert.match(html, /<del lang="en">using<\/del>/);
  assert.equal(feedback.assessment_eligible, false);
});

test('feedback renders complete expression, grammar explanation, then the conversational answer', () => {
  const feedback = feedbackFor("can you recommended dinner menu it's with my wife");
  const html = renderToStaticMarkup(createElement(Feedback, { feedback, onSpeak() {}, onPractice() {} }));
  assert.match(html, /이렇게 말해보세요/);
  assert.match(html, /Can you recommend something for dinner/);
  assert.match(html, /표현 제안/);
  assert.match(html, /<del lang="en">recommended<\/del>/);
  assert.match(html, /<strong lang="en">recommend<\/strong>/);
  assert.match(html, /다시 말해보기/);
  assert.ok(html.indexOf('tutor-expression') < html.indexOf('tutor-correction'));
  assert.ok(html.indexOf('tutor-correction') < html.indexOf('tutor-answer'));
});

test('legacy feedback, translations and style-only coaching remain distinct', () => {
  const legacy = feedbackFor(); delete legacy.natural;
  assert.match(renderToStaticMarkup(createElement(Feedback, { feedback: legacy })), /문법 교정/);
  const mixed = renderToStaticMarkup(createElement(Feedback, { feedback: feedbackFor('오늘 I ate apple.') }));
  assert.match(mixed, /영어로 표현하면/); assert.match(mixed, /핵심 교정/);
  const naturalOnly = { ...feedbackFor('Hello'), natural: { sentence: 'What would you recommend?', explanation_ko: '뜻을 유지한 다른 표현입니다.' } };
  const html = renderToStaticMarkup(createElement(Feedback, { feedback: naturalOnly, showReply: false }));
  assert.match(html, /이렇게 말해보세요/); assert.doesNotMatch(html, /핵심 교정|tutor-answer/);
  const correct = renderToStaticMarkup(createElement(Feedback, { feedback: feedbackFor('I went home yesterday.') }));
  assert.doesNotMatch(correct, /tutor-expression|핵심 교정/);
});

test('model text is escaped, practice can be disabled, and excess corrections are collapsible', () => {
  const feedback = feedbackFor(); feedback.tutor_reply = '<script>alert(1)</script>';
  feedback.errors = Array.from({ length: 5 }, (_, index) => ({ type: 'article', original: `word${index}`, corrected: `a word${index}`, explanation_ko: '관사 설명' }));
  const html = renderToStaticMarkup(createElement(Feedback, { feedback, onPractice() {}, disabled: true }));
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /교정 2개 더보기/); assert.match(html, /disabled=""/);
});

test('topic picker lists all 12 situations without making calls while rendering', () => {
  let calls = 0;
  const html = renderToStaticMarkup(createElement(Topics, { disabled: true, onSelect() { calls++; }, onFree() { calls++; } }));
  assert.equal((html.match(/주제 시작"/g) || []).length, 12);
  assert.match(html, /자유 대화/); assert.match(html, /카페/); assert.match(html, /면접/);
  assert.equal((html.match(/disabled=""/g) || []).length, 13);
  assert.equal(calls, 0);
});

test('usage presents known tokens and missing reports separately, without daily ceilings', () => {
  const own = { today: { requests: 25, tokens: 12345, unreported: 2 }, total: { requests: 200, tokens: 45678, unreported: 7 } };
  const html = renderToStaticMarkup(createElement(Usage, { usage: own }));
  assert.match(html, /12,345/); assert.match(html, /45,678/);
  assert.match(html, /사용량 미확인 2건/); assert.match(html, /사용량 미확인 7건/);
  assert.doesNotMatch(html, /예약|한도|25\/20/);
  const sum = totalUsage([own, own]);
  assert.deepEqual(sum.today, { requests: 50, tokens: 24690, unreported: 4 });
  assert.deepEqual(sum.total, { requests: 400, tokens: 91356, unreported: 14 });
  assert.match(renderToStaticMarkup(createElement(Usage, { usage: null })), /아직 확인하지 못했습니다/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(Usage, { usage: totalUsage() })), /사용량 미확인/);
});

test('Japanese speaking phrases show original, Hangul, meaning and collapsible kana with escaped text', () => {
  const phrase = { sentence: 'コーヒーをください。', reading_kana: 'こーひーをください。', pronunciation_ko: '코오히이오 쿠다사이.', meaning_ko: '커피 주세요.' };
  const html = renderToStaticMarkup(createElement(JapanesePhrase, { phrase, label: '추천 문장', onSpeak() {}, onPractice() {}, disabled: true }));
  assert.match(html, /lang="ja">コーヒーをください。/);
  assert.match(html, /한글 발음/); assert.match(html, /코오히이오 쿠다사이/); assert.match(html, /커피 주세요/);
  assert.match(html, /<details/); assert.match(html, /따라 말하기/); assert.match(html, /disabled=""/);
  const unsafe = renderToStaticMarkup(createElement(JapanesePhrase, { phrase: { ...phrase, meaning_ko: '<script>alert(1)</script>' } }));
  assert.doesNotMatch(unsafe, /<script>/); assert.match(unsafe, /&lt;script&gt;/);
});

test('shared tutor composer labels both actions and requires voice confirmation without hiding text input', () => {
  const props = { id: 'message', draft: { text: 'Hello', mode: 'voice', confirmed: false }, supported: true,
    language: 'en-US', languages: [['en-US', '영어']], languageLabel: '음성 인식 언어', submitLabel: '메시지 제출하기' };
  const pending = renderToStaticMarkup(createElement(Composer, props));
  assert.match(pending, /<span>말하기<\/span>/); assert.match(pending, /<span>제출하기<\/span>/);
  assert.match(pending, /type="submit"[^>]*disabled=""/);
  assert.match(pending, /인식된 문장을 확인했습니다/);
  const confirmed = renderToStaticMarkup(createElement(Composer, { ...props, draft: { ...props.draft, confirmed: true } }));
  assert.doesNotMatch(confirmed, /type="submit"[^>]*disabled=""/);
  const unsupported = renderToStaticMarkup(createElement(Composer, { ...props, supported: false, draft: { text: 'Hi', mode: 'text' } }));
  assert.match(unsupported, /음성 입력 미지원/); assert.match(unsupported, /class="tutor-voice-button" disabled=""/);
  assert.doesNotMatch(unsupported, /<textarea[^>]*disabled/);
  assert.doesNotMatch(unsupported, /type="submit"[^>]*disabled/);
  const starting = renderToStaticMarkup(createElement(Composer, { ...props, listening: false, voiceStarting: true }));
  assert.match(starting, /준비 취소/); assert.match(starting, /마이크 연결 중/);
  assert.match(starting, /aria-pressed="false"/); assert.doesNotMatch(starting, /말하기 종료/);
  assert.match(starting, /type="submit"[^>]*disabled/);
  const stopping = renderToStaticMarkup(createElement(Composer, { ...props, voiceStopping: true }));
  assert.match(stopping, /인식 마무리/); assert.match(stopping, /class="tutor-voice-button" disabled=""/);
});

test('both tutors display Korean-gap coaching before replies, keep practice and listening, and escape all tips', () => {
  const english = cleanEnglish(feedbackFor('I want to 아내랑 저녁 먹다.'), { content: 'I want to 아내랑 저녁 먹다.', inputMode: 'text', level: 'A2', improvements: false });
  const japanese = cleanJapanese(japaneseFeedback('コーヒーを 두 잔 주세요'), { content: 'コーヒーを 두 잔 주세요', inputMode: 'text' });
  const en = renderToStaticMarkup(createElement(Feedback, { feedback: english, onSpeak() {}, onPractice() {}, disabled: true }));
  const ja = renderToStaticMarkup(createElement(JapaneseFeedback, { feedback: japanese, speak() {}, practice() {}, disabled: true }));
  for (const html of [en, ja]) {
    assert.match(html, /이럴 땐 이렇게 말해요/);
    assert.match(html, /상황별 표현 설명/);
    assert.match(html, /이 표현으로 연습하기/);
    assert.match(html, /disabled=""/);
    assert.ok(html.indexOf('tutor-expression-tips') < html.indexOf(html === en ? 'MINA' : 'HARU'));
  }
  assert.match(en, /아내랑 저녁 먹다/); assert.match(en, /have dinner with my wife/);
  assert.doesNotMatch(en, /핵심 교정/);
  assert.match(ja, /二杯/); assert.match(ja, /니하이/); assert.match(ja, /にはい/);
  const review = renderToStaticMarkup(createElement(JapaneseFeedback, { feedback: japanese, reply: false }));
  assert.match(review, /상황별 표현 설명/); assert.doesNotMatch(review, /HARU/);
  english.expression_tips[0].explanation_ko = '<script>alert(1)</script>';
  const escaped = renderToStaticMarkup(createElement(Feedback, { feedback: english }));
  assert.doesNotMatch(escaped, /<script>/); assert.match(escaped, /&lt;script&gt;/);
  const legacy = { ...japanese }; delete legacy.expression_tips;
  assert.match(renderToStaticMarkup(createElement(JapaneseFeedback, { feedback: legacy })), /이렇게 말해보세요/);
});
