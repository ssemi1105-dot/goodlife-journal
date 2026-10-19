import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/speech-fixture.js"></script></body></html>';
const mocks = {
  '/src/hooks/useEnglishTutor.js': `import {makeTopicOpening} from '/supabase/functions/japanese-tutor/topics.mjs';
    const session={id:'speech-fixture',title:'카페',opening:makeTopicOpening('cafe'),created_at:'2026-10-19T00:00:00Z'};
    export function useTutor(){return {data:{profile:{level:'starter'},sessions:[session],review:[]},session,turns:[],busy:false,loading:false,
      reload:()=>{window.__reloads++},send:async(...args)=>{window.__submitted.push(args);return true}};}`,
  '/src/services/tutorClient.js': `export const callJapaneseTutor=()=>{throw new Error('Unexpected API call')};export const tutorErrorMessage=code=>code;`,
};
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5190, strictPort: false },
  plugins: [{ name: 'isolated-japanese-speech', enforce: 'pre',
    resolveId(id) { if (id === '/speech-fixture.js') return '\0speech-fixture.js'; },
    load(id) {
      if (id === '\0speech-fixture.js') return `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
        import JapaneseTutor from '/src/components/JapaneseTutor.jsx';import '/src/styles.css';
        function Fixture(){const[open,setOpen]=useState(true);return open?React.createElement(JapaneseTutor,{userId:'speech-test',onBack:()=>setOpen(false)}):React.createElement('p',null,'Closed');}
        createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Fixture)));`;
      const path = Object.keys(mocks).find(key => id.replaceAll('\\', '/').endsWith(key));
      return path ? mocks[path] : null;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/speech-test.html') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, html));
    }); },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    window.__recognizers = []; window.__submitted = []; window.__reloads = 0;
    class Recognition {
      constructor() { this.aborts = 0; window.__recognizers.push(this); }
      start() { if (window.__startError) throw new DOMException('Test failure', window.__startError); }
      stop() { this.stopped = true; }
      abort() { this.aborts++; this.onend?.(); }
    }
    // Exercise the Safari-prefixed API without recording or contacting a speech service.
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition });
    window.__emit = (event, data = {}, index = -1) => window.__recognizers.at(index)?.['on' + event]?.(data);
    const synthesis = new EventTarget(); synthesis.getVoices = () => []; synthesis.cancel = () => {};
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
  });
  const external = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net' && route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    external.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.clock.install();
  await page.goto(`${server.resolvedUrls.local[0]}speech-test.html`);
  const mic = () => page.getByRole('button', { name: '말하기', exact: true });
  const stop = () => page.getByRole('button', { name: '말하기 종료', exact: true });
  const input = page.getByRole('textbox', { name: /내 답변|인식된 문장/ });
  const send = page.getByRole('button', { name: '일본어 메시지 제출하기' });
  const emit = (event, data) => page.evaluate(([event, data]) => window.__emit(event, data), [event, data]);
  const assertIdle = async () => { await mic().waitFor(); assert.equal(await input.isEnabled(), true); };
  const start = async () => { await mic().click(); await page.getByRole('button', { name: '준비 취소' }).waitFor(); };
  const listen = async () => { await start(); await emit('start'); await stop().waitFor(); };

  await input.fill('기존 초안'); await start();
  assert.equal(await page.locator('.tutor-voice-button').getAttribute('aria-pressed'), 'false');
  assert.equal(await send.isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__recognizers.at(-1).lang), 'ja-JP');
  await page.getByRole('button', { name: '준비 취소' }).click(); await assertIdle();
  assert.equal(await input.inputValue(), '기존 초안'); assert.equal(await page.getByRole('alert').count(), 0);

  await listen();
  const result = { resultIndex: 0, results: [[{ transcript: 'コーヒーをください。' }]] };
  await emit('result', result); await emit('result', result);
  await stop().click(); await page.getByRole('button', { name: '인식 마무리' }).waitFor();
  await emit('end'); await assertIdle();
  assert.equal(await input.inputValue(), '기존 초안 コーヒーをください。');
  assert.equal(await send.isDisabled(), true); assert.deepEqual(await page.evaluate(() => window.__submitted), []);
  await page.getByRole('checkbox', { name: '인식된 문장을 확인했습니다' }).check();
  await send.click(); assert.equal(await input.inputValue(), '');
  assert.equal(await page.evaluate(() => window.__submitted.length), 1);

  for (const code of ['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture', 'network', 'no-speech', 'aborted']) {
    await listen(); await emit('error', { error: code }); await assertIdle();
    assert.ok((await page.getByRole('alert').innerText()).includes(`(${code})`));
    assert.ok(await page.evaluate(() => window.__recognizers.at(-1).aborts > 0));
  }
  // Retry is a direct microphone action, not a tutor/DB reload or paid API call.
  await page.getByRole('button', { name: '다시 말하기', exact: true }).click();
  await page.getByRole('button', { name: '준비 취소' }).waitFor();
  assert.equal(await page.evaluate(() => window.__reloads), 0);
  await emit('end'); await assertIdle(); assert.match(await page.getByRole('alert').innerText(), /start-ended/);

  await start(); await page.clock.fastForward(12001); await assertIdle();
  assert.match(await page.getByRole('alert').innerText(), /start-timeout/);
  await listen(); await page.clock.fastForward(60001); await assertIdle();
  assert.match(await page.getByRole('alert').innerText(), /result-timeout/);
  await listen(); await stop().click(); await page.clock.fastForward(4001); await assertIdle();
  assert.match(await page.getByRole('alert').innerText(), /stop-timeout/);
  await listen(); await emit('end'); await assertIdle();
  assert.match(await page.getByRole('alert').innerText(), /no-result/);

  await page.evaluate(() => { window.__startError = 'NotAllowedError'; });
  await mic().click(); await assertIdle(); assert.match(await page.getByRole('alert').innerText(), /NotAllowedError/);
  await page.evaluate(() => { delete window.__startError; });
  await page.getByRole('combobox', { name: '말하기 언어' }).selectOption('ko-KR');
  await listen(); assert.equal(await page.evaluate(() => window.__recognizers.at(-1).lang), 'ko-KR');
  await emit('error', { error: 'language-not-supported' }); await assertIdle();
  assert.match(await page.getByRole('alert').innerText(), /한국어를 지원하지/);

  await listen();
  await page.evaluate(() => {
    window.__staleResult = window.__recognizers.at(-1).onresult;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
  });
  await assertIdle(); assert.equal(await page.getByRole('alert').count(), 0);
  await listen(); await page.evaluate(result => window.__staleResult(result), result);
  assert.equal(await input.inputValue(), '');
  await emit('result', result); await emit('end'); await assertIdle();
  assert.equal(await input.inputValue(), 'コーヒーをください。');

  await mkdir('test-results', { recursive: true });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await listen(); await emit('error', { error: 'service-not-allowed' }); await assertIdle();
    const bounds = await send.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 844);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/japanese-speech-error-${width}.png` });
  }
  await listen(); await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByText('Closed', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => window.__recognizers.at(-1).aborts > 0));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Japanese speech: start/stop, errors, timeout, retry, draft, confirmation, cleanup and 3 mobile layouts passed (mock recognition).');
} finally { await browser?.close(); await server.close(); }
