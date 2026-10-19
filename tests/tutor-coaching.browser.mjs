import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { feedbackFor } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { cleanTutorFeedback as cleanEnglish } from '../supabase/functions/english-tutor/core.mjs';
import { cleanTutorFeedback as cleanJapanese } from '../supabase/functions/japanese-tutor/core.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const englishInput = 'I want to 아내랑 저녁 먹다.', japaneseInput = 'コーヒーを 두 잔 주세요';
const fixtures = {
  en: { content: englishInput, feedback: cleanEnglish(feedbackFor(englishInput), { content: englishInput, inputMode: 'text', improvements: false, level: 'A2' }) },
  ja: { content: japaneseInput, feedback: cleanJapanese(japaneseFeedback(japaneseInput), { content: japaneseInput, inputMode: 'text', level: 'starter' }) },
};
const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/coaching-fixture.js"></script></body></html>';
const mockHook = `const fixtures=${JSON.stringify(fixtures)};
  const language=new URLSearchParams(location.search).get('language');
  const session={id:'fixture',title:'표현 연습',created_at:'2026-10-19T00:00:00Z'};
  const turn={...fixtures[language],id:'turn',session_id:'fixture',state:'completed',created_at:'2026-10-19T00:00:00Z'};
  export function useTutor(){return {data:{profile:{level:language==='ja'?'starter':'A2',improvements:false},learning:{counts:{}},sessions:[session],review:[turn]},
    session,turns:[turn],busy:false,loading:false,pending:null,reload(){},markReviewed(){},
    send:async(...args)=>{window.__submitted.push(args);return true;}};}
  export const useEnglishTutor=useTutor;`;
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5192, strictPort: false }, plugins: [{
  name: 'isolated-expression-coaching', enforce: 'pre',
  resolveId(id) { if (id === '/coaching-fixture.js') return '\0coaching-fixture.js'; },
  load(id) {
    if (id === '\0coaching-fixture.js') return `import React from 'react';import{createRoot}from'react-dom/client';
      import EnglishTutor from '/src/components/EnglishTutor.jsx';import JapaneseTutor from '/src/components/JapaneseTutor.jsx';import '/src/styles.css';
      const Component=new URLSearchParams(location.search).get('language')==='ja'?JapaneseTutor:EnglishTutor;
      createRoot(document.getElementById('root')).render(React.createElement(Component,{userId:'coaching-test',onBack(){}}));`;
    if (id.replaceAll('\\', '/').endsWith('/src/hooks/useEnglishTutor.js')) return mockHook;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/coaching-test.html')) return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, html));
  }); },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir('test-results', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1024, height: 768 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: true });
    await context.addInitScript(() => {
      window.__submitted = []; window.__spoken = [];
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      const synthesis = new EventTarget();
      synthesis.getVoices = () => [{ lang: 'en-US' }, { lang: 'ja-JP' }]; synthesis.cancel = () => {};
      synthesis.speak = utterance => window.__spoken.push(utterance.text);
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
    });
    const external = [], errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname === 'cdn.jsdelivr.net' && route.request().resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' });
      external.push(url.origin); return route.abort();
    });
    for (const language of ['en', 'ja']) {
      const page = await context.newPage(); page.setDefaultTimeout(8000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.resolvedUrls.local[0]}coaching-test.html?language=${language}`);
      await page.getByRole('heading', { name: '이럴 땐 이렇게 말해요' }).waitFor();
      await page.getByRole('list', { name: '상황별 표현 설명' }).waitFor();
      const fullSentence = language === 'en' ? fixtures.en.feedback.english_version : fixtures.ja.feedback.natural.sentence;
      if (language === 'ja') assert.match(await page.locator('.tutor-expression-tips').textContent(), /니하이/);
      const speakName = language === 'en' ? '추천 문장 듣기' : '이럴 땐 이렇게 말해요 듣기';
      await page.getByRole('button', { name: speakName, exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.__spoken), [fullSentence]);
      await page.getByRole('button', { name: '이 표현으로 연습하기', exact: true }).click();
      const target = page.locator(language === 'en' ? '.tutor-practice-target' : '.japanese-practice-target');
      assert.ok((await target.textContent()).includes(fullSentence));
      const input = page.getByRole('textbox'); await input.fill('남아 있는 초안');
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: '이 표현으로 연습하기', exact: true }).click();
      assert.equal(await input.inputValue(), '남아 있는 초안');
      assert.equal(await page.evaluate(() => window.__submitted.length), 0, 'practice never auto-submits or pays');
      await page.locator('.tutor-conversation').evaluate(element => { element.scrollTop = 0; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const composer = await page.locator('.tutor-composer').boundingBox();
      assert.ok(composer && composer.y + composer.height <= viewport.height + 2, 'composer remains visible');
      await page.screenshot({ path: `test-results/coaching-${language}-${viewport.width}.png` });
      await page.getByRole('button', { name: '학습 메뉴', exact: true }).click();
      await page.getByRole('tab', { name: /^복습/ }).click();
      await page.getByRole('list', { name: '상황별 표현 설명' }).waitFor();
      await page.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
  }
  console.log('English/Japanese coaching passed: 3 viewport sizes, readable tips, Japanese readings, listening, practice, draft retention and review. No external API calls.');
} finally { await browser?.close(); await server.close(); }
