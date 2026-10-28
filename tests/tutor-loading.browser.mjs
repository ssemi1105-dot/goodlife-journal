import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { feedbackFor } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { makeTopicOpening as englishOpening } from '../supabase/functions/english-tutor/topics.mjs';
import { makeTopicOpening as japaneseOpening } from '../supabase/functions/japanese-tutor/topics.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const html = '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/loading-fixture.js"></script></body></html>';
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5194, strictPort: false }, plugins: [{
  name: 'isolated-tutor-loading', enforce: 'pre',
  resolveId(id) { if (id === '/loading-fixture.js') return '\0loading-fixture.js'; },
  load(id) {
    if (id === '\0loading-fixture.js') return `import React from 'react';import{createRoot}from'react-dom/client';
      import EnglishTutor from '/src/components/EnglishTutor.jsx';import JapaneseTutor from '/src/components/JapaneseTutor.jsx';import '/src/styles.css';
      const Component=new URLSearchParams(location.search).get('language')==='ja'?JapaneseTutor:EnglishTutor;
      createRoot(document.getElementById('root')).render(React.createElement(Component,{userId:'loading-test',onBack(){}}));`;
    if (id.replaceAll('\\', '/').endsWith('/src/lib/supabaseClient.js')) return `export const SUPABASE_URL=location.origin+'/fixture';export const SUPABASE_ANON_KEY='test-only';export const isSupabaseConfigured=true;export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-only'}}})}};`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/loading-test.html')) return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, html));
  }); },
}] });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir('test-results', { recursive: true });
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    for (const language of ['en', 'ja']) for (const scenario of viewport.width === 390 ? ['existing', 'empty', 'session-error', 'bootstrap-error', 'pending'] : ['existing']) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: true });
      const page = await context.newPage(); page.setDefaultTimeout(8000);
      const bootstrapGate = gate(), sessionGate = gate(), sessionRequested = gate();
      const actions = [], errors = [], external = [];
      let fail = scenario.endsWith('error'), selection = null;
      const session = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '이전 대화', created_at: '2026-10-20T00:00:00Z' };
      const content = language === 'en' ? 'I went home yesterday.' : '커피 주세요';
      const turns = Array.from({ length: 8 }, (_, i) => ({ id: `turn-${i}`, content,
        state: scenario === 'pending' && i === 7 ? 'pending' : 'completed', input_mode: 'text', created_at: session.created_at,
        feedback: (language === 'en' ? feedbackFor : japaneseFeedback)(content) }));
      page.on('pageerror', error => errors.push(error.message));
      await context.addInitScript(() => {
        window.__topicDuringLoading = false;
        new MutationObserver(() => {
          if (document.querySelector('.tutor-topic-picker') && document.querySelector('.tutor-state[role="status"]')) window.__topicDuringLoading = true;
        }).observe(document, { childList: true, subtree: true });
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/fixture/functions/v1/')) {
          const body = route.request().postDataJSON(); actions.push(body.action);
          if (body.action === 'study-list') return route.fulfill({ json: { items: [] } });
          if (body.action === 'bootstrap') {
            await bootstrapGate.promise;
            if (fail && scenario === 'bootstrap-error') return route.fulfill({ status: 503, json: { code: 'DATABASE_ERROR' } });
            return route.fulfill({ json: { profile: { level: language === 'en' ? 'A2' : 'starter', improvements: false }, learning: { counts: {}, sampleSize: 0 }, review: [],
              usage: { today: { requests: 0, tokens: 0, unreported: 0 }, total: { requests: 0, tokens: 0, unreported: 0 } },
              sessions: selection ? [selection, session] : scenario === 'empty' ? [] : [session] } });
          }
          if (body.action === 'session') {
            sessionRequested.release(); await sessionGate.promise;
            if (fail && scenario === 'session-error') return route.fulfill({ status: 503, json: { code: 'DATABASE_ERROR' } });
            return route.fulfill({ json: { session: selection || session, turns: selection ? [] : turns } });
          }
          if (body.action === 'start-topic') {
            selection = { ...session, id: body.sessionId, topic_id: body.topicId, title: '카페', opening: (language === 'en' ? englishOpening : japaneseOpening)(body.topicId) };
            return route.fulfill({ json: { session: selection } });
          }
          errors.push(`Unexpected API action: ${body.action}`);
          return route.fulfill({ status: 500, json: { code: 'SERVER_ERROR' } });
        }
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname === 'cdn.jsdelivr.net' && route.request().resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' });
        external.push(url.origin); return route.abort();
      });
      const noPrematureControls = async () => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('.tutor-topic-picker, .tutor-topic-trigger, .tutor-menu-trigger, .tutor-composer').count(), 0);
      };
      try {
        await page.goto(`${server.resolvedUrls.local[0]}loading-test.html?language=${language}`);
        await page.getByText('학습 기록 불러오는 중…', { exact: true }).waitFor();
        await noPrematureControls();
        bootstrapGate.release();
        if (!['empty', 'bootstrap-error'].includes(scenario)) {
          await sessionRequested.promise;
          await noPrematureControls();
        }
        sessionGate.release();
        if (fail) {
          await page.getByRole('alert').waitFor();
          await noPrematureControls();
          fail = false;
          await page.getByRole('button', { name: '다시 확인', exact: true }).click();
        }
        const trigger = page.getByRole('button', { name: '주제 변경', exact: true });
        await trigger.waitFor();
        assert.equal(await page.evaluate(() => window.__topicDuringLoading), false, 'topics never mount while restoring history');
        if (scenario === 'empty') {
          assert.equal(await page.locator('.tutor-topic-grid button').count(), language === 'en' ? 0 : 10);
          if (language === 'en') await page.locator('#tutor-message').waitFor();
          assert.deepEqual(actions.filter(action => action !== 'study-list'), ['bootstrap']);
        } else {
          const input = page.locator(language === 'en' ? '#tutor-message' : '#japanese-message');
          await input.waitFor();
          assert.equal(await page.locator('.tutor-topic-picker').count(), 0);
          assert.equal(await trigger.isDisabled(), scenario === 'pending');
          if (scenario === 'pending') {
            await page.getByRole('button', { name: '저장 상태 확인', exact: true }).click();
            await page.getByRole('alert').filter({ hasText: '아직 답변을 처리 중' }).waitFor();
            assert.equal(actions.filter(action => action === 'send').length, 0, 'pending checks only load server state');
          }
          if (scenario === 'existing') {
            await input.fill('작성 중인 문장은 유지');
            const before = actions.length, headerBox = await trigger.boundingBox();
            for (const position of [0, 100000]) {
              await page.locator('.tutor-conversation').evaluate((el, top) => { el.scrollTop = top; }, position);
              assert.deepEqual(await trigger.boundingBox(), headerBox, 'topic action stays outside conversation scrolling');
            }
            await page.screenshot({ path: `test-results/tutor-topic-${language}-${viewport.width}.png` });
            await trigger.click();
            await page.locator('.tutor-topic-picker').waitFor();
            assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
            await page.getByRole('button', { name: '주제 선택 닫기', exact: true }).click();
            assert.equal(await input.inputValue(), '작성 중인 문장은 유지');
            assert.equal(actions.length, before, 'opening/closing topics is local, never a paid call');
            await trigger.click();
            const cafe = page.getByRole('button', { name: language === 'en' ? '카페 주제 시작' : '카페 일본어 시작', exact: true });
            if (language === 'ja') await cafe.click();
            const start = language === 'en' ? cafe : page.getByRole('button', { name: '이 주제로 대화 시작', exact: true });
            page.once('dialog', dialog => dialog.dismiss()); await start.click();
            assert.equal(actions.length, before, 'cancelled topic switch creates no session');
            page.once('dialog', dialog => dialog.accept()); await start.click();
            await page.locator('.tutor-opening').waitFor();
            assert.equal(await input.inputValue(), '작성 중인 문장은 유지');
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            assert.equal(actions.filter(action => action === 'start-topic').length, language === 'en' ? 0 : 1);
            await page.reload();
            await page.locator('.tutor-opening').waitFor();
            assert.equal(await input.inputValue(), '작성 중인 문장은 유지');
            assert.equal(await page.locator('.tutor-topic-picker').count(), 0);
          }
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        const titleFits = await page.locator('.tutor-header h1').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
        assert.equal(titleFits, true, 'header title remains readable');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        assert.ok(!actions.includes('send'));
        console.log(`${language} ${viewport.width}px ${scenario}: passed`);
      } catch (error) {
        console.error({ language, viewport, scenario, errors, actions, text: (await page.locator('body').innerText()).slice(0, 1800) });
        await page.screenshot({ path: `test-results/tutor-loading-failed-${language}-${viewport.width}.png` });
        throw error;
      } finally { bootstrapGate.release(); sessionGate.release(); await context.close(); }
    }
  }
  console.log('Tutor loading and persistent topic actions passed. Mock responses only; no real accounts, writes or paid API calls.');
} finally { await browser?.close(); await server.close(); }
