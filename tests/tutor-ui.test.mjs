import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { feedbackFor } from './helpers/tutorDatabase.mjs';

let server, Feedback, Topics;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
  Feedback = (await server.ssrLoadModule('/src/components/TutorFeedback.jsx')).default;
  Topics = (await server.ssrLoadModule('/src/components/TutorTopics.jsx')).default;
});
after(async () => { await server?.close(); });

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
