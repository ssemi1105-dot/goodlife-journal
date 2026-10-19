import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { createTutorDatabase, feedbackFor, USER_A } from './helpers/tutorDatabase.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import * as japanese from '../supabase/functions/japanese-tutor/core.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const db = await createTutorDatabase({ japanese: true });
await db.pg.query('insert into japanese_tutor_access(user_id,enabled) values ($1,true)', [USER_A]);
let calls = 0, mode = 'ok';
const handlers = Object.fromEntries([['english-tutor', null], ['japanese-tutor', japanese]].map(([name, curriculum]) => [name,
  createTutorHandler({ createClient: () => db.client, curriculum, logDiagnostic() {},
    env: key => ({ SUPABASE_URL: 'http://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', HIVE_API_KEY: 'test-only' })[key],
    fetchImpl: async (_url, options) => {
      calls++;
      const content = JSON.parse(options.body).messages.at(-1).content;
      const feedback = (curriculum ? japaneseFeedback : feedbackFor)(content);
      feedback.memory = null;
      return Response.json({ choices: [{ finish_reason: mode === 'limit' ? 'length' : 'stop',
        message: { content: '```json\n' + JSON.stringify(feedback) + '\n```' } }], usage: { total_tokens: 400 } });
    },
  }),
]));
const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/response-fixture.js"></script></body></html>';
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5193, strictPort: false }, plugins: [{
  name: 'isolated-tutor-response', enforce: 'pre',
  resolveId(id) { if (id === '/response-fixture.js') return '\0response-fixture.js'; },
  load(id) {
    if (id === '\0response-fixture.js') return `import React from 'react';import{createRoot}from'react-dom/client';
      import EnglishTutor from '/src/components/EnglishTutor.jsx';import JapaneseTutor from '/src/components/JapaneseTutor.jsx';import '/src/styles.css';
      const Component=new URLSearchParams(location.search).get('language')==='ja'?JapaneseTutor:EnglishTutor;
      createRoot(document.getElementById('root')).render(React.createElement(Component,{userId:'${USER_A}',onBack(){}}));`;
    if (id.replaceAll('\\', '/').endsWith('/src/lib/supabaseClient.js')) return `export const SUPABASE_URL=location.origin+'/response-fixture';
      export const SUPABASE_ANON_KEY='test-only';export const isSupabaseConfigured=true;
      export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'${USER_A}'}}})}};`;
  },
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/response-test.html')) {
        res.setHeader('Content-Type', 'text/html'); return res.end(await vite.transformIndexHtml(req.url, html));
      }
      const handler = handlers[req.url?.replace('/response-fixture/functions/v1/', '')];
      if (!handler) return next();
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await handler(new Request('http://fixture.invalid', { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch { res.writeHead(500); res.end('{}'); }
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir('test-results', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const errors = [], external = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname === 'cdn.jsdelivr.net' && route.request().resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' });
      external.push(url.origin); return route.abort();
    });
    for (const language of ['en', 'ja']) {
      const prefix = language === 'en' ? 'tutor_' : 'japanese_tutor_';
      const content = language === 'en' ? 'I always using the air conditioner.' : '커피 주세요';
      // Use fresh local sessions; never read or write real user data.
      await db.pg.exec(`delete from ${prefix}sessions where user_id='${USER_A}'; update ${prefix}usage set last_request_at=now()-interval '10 seconds'`);
      const created = await handlers[language === 'en' ? 'english-tutor' : 'japanese-tutor'](new Request('http://fixture.invalid', {
        method: 'POST', headers: { Authorization: `Bearer ${USER_A}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-session', title: 'Response regression' }),
      }));
      assert.equal(created.status, 200);
      mode = 'ok';
      const before = calls, page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.resolvedUrls.local[0]}response-test.html?language=${language}`);
      const input = page.locator(language === 'en' ? '#tutor-message' : '#japanese-message');
      const answer = language === 'en' ? page.locator('.tutor-answer') : page.locator('.japanese-phrase').filter({ has: page.getByRole('heading', { name: 'HARU', exact: true }) });
      await input.fill(content);
      await page.locator('.tutor-send').click();
      try { await answer.waitFor(); }
      catch (error) {
        console.error(await page.locator('body').innerText());
        await page.screenshot({ path: 'test-results/response-debug.png' });
        throw error;
      }
      await page.waitForFunction(selector => document.querySelector(selector)?.value === '', language === 'en' ? '#tutor-message' : '#japanese-message');
      if (language === 'en') {
        assert.equal(await page.locator('.tutor-correction-pair strong').textContent(), 'use');
        assert.match(await answer.textContent(), /What temperature do you usually set it to/);
      } else assert.ok((await answer.textContent()).length > 0);
      assert.equal(calls, before + 1);
      await page.reload();
      await answer.waitFor();
      assert.equal(calls, before + 1, 'reload only loads persisted data');
      await page.screenshot({ path: `test-results/response-${language}-${viewport.width}.png` });

      await db.pg.exec(`update ${prefix}usage set last_request_at=now()-interval '10 seconds'`);
      mode = 'limit';
      await input.fill(content); await page.locator('.tutor-send').click();
      await page.getByRole('alert').filter({ hasText: '길이 제한으로 중간에 끊겼습니다' }).waitFor();
      assert.equal(await input.inputValue(), content, 'failed reply preserves the editable draft');
      assert.equal(calls, before + 2);
      await page.getByRole('button', { name: '다시 확인', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.tutor-send').disabled);
      assert.equal(calls, before + 2, 'status check never repeats a paid request');
      assert.equal(await input.inputValue(), content);
      assert.match(await page.locator('.tutor-failed').textContent(), /교정과 응답을 저장하지 못했습니다/);
      assert.doesNotMatch(await page.locator('.tutor-failed').textContent(), /학습 평가에 반영하지/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const composer = await page.locator('.tutor-composer').boundingBox();
      assert.ok(composer.y + composer.height <= viewport.height + 2);
      await page.screenshot({ path: `test-results/response-failed-${language}-${viewport.width}.png` });
      await page.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
  }
  console.log('Both tutors passed mobile response recovery, persisted reload, failed-draft retention, accurate errors and no automatic paid retries. Mock provider; no external API calls.');
} finally { await browser?.close(); await server.close(); await db.close(); }
