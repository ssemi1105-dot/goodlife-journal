import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { createTutorDatabase, USER_A, USER_B, SESSION_A, feedbackFor } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import { APP_VERSION } from '../src/lib/appVersion.js';
import * as japaneseCurriculum from '../supabase/functions/japanese-tutor/core.mjs';
import { japaneseFeedback } from './helpers/japaneseFeedback.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const db = await createTutorDatabase({ japanese: true });
let calls = 0, providerMode = 'ok', failRead = false, rejectAdminWrite = false;
const handler = createTutorHandler({ createClient: () => db.client,
  env: key => ({ SUPABASE_URL: 'http://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', HIVE_API_KEY: 'test-only' })[key],
  fetchImpl: async (_url, options) => {
    calls++;
    if (providerMode === 'balance') return new Response('{}', { status: 405 });
    const content = JSON.parse(options.body).messages.at(-1).content;
    return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(feedbackFor(content)) }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { total_tokens: 400 } })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  },
});
let japaneseCalls = 0, japaneseMode = 'ok';
const japaneseHandler = createTutorHandler({ createClient: () => db.client, curriculum: japaneseCurriculum,
  env: key => ({ SUPABASE_URL: 'http://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', HIVE_API_KEY: 'test-only' })[key],
  fetchImpl: async (_url, options) => {
    japaneseCalls++;
    if (japaneseMode === 'balance') return new Response('{}', { status: 405 });
    const content = JSON.parse(options.body).messages.at(-1).content;
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(japaneseFeedback(content)) } }], usage: { total_tokens: 600 } });
  },
});
const mocks = {
  '/src/hooks/useAuth.js': `const owner=new URLSearchParams(location.search).get('account')!=='B'; const user={id:owner?'${USER_A}':'${USER_B}',email:'test@example.invalid'}; const auth={userId:user.id,session:{user},profile:{display_name:'테스트',role:owner?'owner':'member'},loading:false,isOwner:owner,configured:true}; export function useAuth(){return auth;}`,
  '/src/hooks/useRecords.js': 'const state={records:[],loading:false,error:"",reloadRecords:async()=>{}}; export function useRecords(){return state;}',
  '/src/hooks/useAppSettings.js': `import {DEFAULT_FINANCE_MODES,getDefaultCategoryOrder} from '/src/data/categoryDefinitions.js'; const state={settings:{category_order:getDefaultCategoryOrder(),hidden_categories:[],favorite_categories:[],finance_modes:DEFAULT_FINANCE_MODES,sort_by_record_count:true,reminder_settings:{}},error:''}; export function useAppSettings(){return state;}`,
  '/src/lib/supabaseClient.js': `export const SUPABASE_URL=location.origin+'/tutor-fixture'; export const SUPABASE_ANON_KEY='test-only'; export const isSupabaseConfigured=true; export const supabase={auth:{getSession:async()=>({data:{session:{access_token:new URLSearchParams(location.search).get('account')==='B'?'${USER_B}':'${USER_A}'}}})}};`,
  '/src/hooks/useSharing.js': `export function useSharing(){return {shareSettings:{},sharedCount:0,friends:[],loading:false,friendError:''};}`,
};
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5189, strictPort: false },
  plugins: [{ name: 'isolated-tutor-test', enforce: 'pre',
    load(id) { const key = Object.keys(mocks).find(path => id.replaceAll('\\', '/').endsWith(path)); return key ? mocks[key] : null; },
    configureServer(vite) {
      vite.middlewares.use('/tutor-fixture/functions/v1/japanese-tutor', async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await japaneseHandler(new Request('http://fixture.invalid', { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      });
      vite.middlewares.use('/tutor-fixture/functions/v1/admin-list-users', (req, res) => {
        if (req.headers.authorization !== `Bearer ${USER_A}`) { res.writeHead(403); return res.end('{}'); }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ users: [{ id: USER_A, email: 'owner@example.invalid', displayName: '관리자', role: 'owner' }, { id: USER_B, email: 'learner@example.invalid', displayName: '다른 학습자', role: 'member' }] }));
      });
      vite.middlewares.use('/tutor-fixture/functions/v1/english-tutor', async (req, res) => {
        try {
          const chunks = []; for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString('utf8');
          const action = JSON.parse(body).action;
          const response = (failRead && ['bootstrap', 'session'].includes(action)) || (rejectAdminWrite && action === 'admin-set-access')
            ? Response.json({ code: 'DATABASE_ERROR' }, { status: 503 })
            : await handler(new Request('http://fixture.invalid/functions/v1/english-tutor', { method: req.method, headers: req.headers, body }));
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
        } catch (error) { res.writeHead(500); res.end(JSON.stringify({ code: 'TEST_ERROR', message: error.message })); }
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  // Exercise the speech workflow without microphones or external recognition services.
  class FakeRecognition {
    start() { window.__lastRecognitionLanguage = this.lang; this.onstart?.(); if (window.__holdSpeech) return; queueMicrotask(() => { this.onresult?.({ results: [[{ transcript: window.__testSpeechText || 'I would like pasta.' }]] }); this.onend?.(); }); }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
  const synthesis = new EventTarget();
  synthesis.getVoices = () => window.__noJapaneseVoice ? [] : [{ lang: 'ja-JP', name: 'Test Japanese' }, { lang: 'en-US', name: 'Test English' }];
  synthesis.cancel = () => {};
  synthesis.speak = utterance => { window.__lastSpoken = { lang: utterance.lang, text: utterance.text, rate: utterance.rate }; };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
});
const network = [], errors = [];
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  network.push(url.origin); return route.fulfill({ json: [] });
});
const page = await context.newPage(); page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const releaseRateLimit = () => db.pg.exec('update tutor_usage set last_request_at=now()-interval \'10 seconds\'');
const openStudyMenu = async (target = page) => { await target.getByRole('button', { name: '학습 메뉴', exact: true }).click(); };
const switchTab = async (name, target = page) => { await openStudyMenu(target); await target.getByRole('tab', { name, exact: typeof name === 'string' }).click(); };
const menuAction = async name => { await openStudyMenu(); await page.getByRole('button', { name, exact: true }).click(); };
const leaveTutor = async () => { await page.getByRole('button', { name: '뒤로', exact: true }).click(); await page.getByRole('navigation', { name: '하단 내비게이션' }).waitFor(); };
const assertFocusLayout = async (width, height) => {
  assert.equal(await page.locator('.bottom-nav').count(), 0, 'study screen has no app navigation');
  assert.equal(await page.getByRole('tablist').count(), 0, 'study tabs stay in the closed menu');
  assert.equal(await page.getByRole('combobox', { name: /대화 선택/ }).count(), 0);
  const header = await page.locator('.tutor-header').boundingBox();
  const composer = await page.locator('.tutor-composer').boundingBox();
  const conversation = await page.locator('.tutor-conversation').boundingBox();
  const mic = await page.getByRole('button', { name: '말하기', exact: true }).boundingBox();
  const submit = await page.locator('.tutor-send').boundingBox();
  assert.ok(header.height <= 50, `compact header at ${width}`);
  assert.ok(composer.y + composer.height <= height && composer.y + composer.height > height - 35, 'composer uses bottom safe area');
  assert.ok(mic.height >= 44 && submit.height >= 44 && Math.abs(mic.y - submit.y) < 1, 'both actions are large and on the same row');
  assert.ok(conversation.height > height * .5, 'more than half the screen belongs to the conversation');
};
const assertKeyboardLayout = async (input, screenshot) => {
  await input.focus();
  const element = await input.elementHandle();
  await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 360 }); window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => document.querySelector('.tutor-screen').getBoundingClientRect().height === 360);
  const buttons = await page.locator('.tutor-action-row').boundingBox();
  assert.ok(buttons.y + buttons.height <= 360, 'actions remain above the simulated keyboard');
  assert.ok((await page.locator('.tutor-conversation').boundingBox()).height > 80, 'conversation remains visible above the keyboard');
  assert.ok(await element.evaluate(el => el.isConnected && document.activeElement === el), 'viewport resize does not replace the focused input');
  await page.screenshot({ path: `test-results/${screenshot}.png` });
  await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => !document.querySelector('.tutor-keyboard-open'));
};
const assertMicControl = async () => {
  await page.evaluate(() => { window.__holdSpeech = true; });
  const before = calls + japaneseCalls;
  await page.getByRole('button', { name: '말하기', exact: true }).click();
  const stop = page.getByRole('button', { name: '말하기 종료', exact: true });
  await stop.waitFor();
  assert.equal(await stop.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.tutor-send').isDisabled(), true);
  await stop.click();
  await page.getByRole('button', { name: '말하기', exact: true }).waitFor();
  assert.equal(calls + japaneseCalls, before, 'speaking/stop buttons never submit');
  await page.evaluate(() => { window.__holdSpeech = false; });
};
const openTutor = async (entry = 'category') => {
  await (entry === 'category' ? page.getByRole('button', { name: '영어 튜터 열기', exact: true }) : page.locator('.tutor-launch-button').filter({ hasText: '영어 튜터' })).click();
  await page.getByRole('button', { name: '학습 메뉴', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.tutor-state[role="status"]'));
};
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByText(`VERSION ${APP_VERSION}`, { exact: true }).waitFor();
  assert.equal(await page.locator('.category-grid > button').first().getAttribute('aria-label'), '영어 튜터 열기');
  assert.equal(calls, 0, 'showing the shortcut does not call Hive');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tile of await page.locator('.tutor-category-tile').all()) {
      await tile.scrollIntoViewIfNeeded();
      assert.ok(await tile.locator('strong').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), `tutor label fits ${width}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `home overflow ${width}`);
    await page.screenshot({ path: `test-results/tutor-category-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openTutor();
  await page.getByText('How was your day?', { exact: true }).waitFor();
  await menuAction('새 주제 선택');
  assert.equal(await page.locator('.tutor-topic-grid button').count(), 12);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `test-results/tutor-topics-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let lostTopic = false;
  await page.route('**/tutor-fixture/functions/v1/english-tutor', async route => {
    if (route.request().postDataJSON().action === 'start-topic' && !lostTopic) { await route.fetch(); lostTopic = true; return route.abort(); }
    return route.continue();
  });
  await page.getByRole('button', { name: '식당 주제 시작', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '서버에 연결하지 못했습니다' }).waitFor();
  await page.getByRole('button', { name: '식당 주제 시작', exact: true }).click();
  await page.getByRole('region', { name: '튜터 시작 질문' }).waitFor();
  assert.equal(await page.locator('.tutor-opening .tutor-answer p').textContent(), 'Welcome! What would you like to eat?');
  assert.equal((await db.pg.query('select count(*)::int n from tutor_sessions where user_id=$1', [USER_A])).rows[0].n, 2);
  assert.equal(calls, 0);
  await page.unroute('**/tutor-fixture/functions/v1/english-tutor');
  await page.reload(); await openTutor();
  assert.equal(await page.locator('.tutor-opening .tutor-answer p').textContent(), 'Welcome! What would you like to eat?');
  assert.equal(calls, 0);
  await openStudyMenu(); await page.getByLabel('대화 선택').selectOption(SESSION_A);
  await page.getByText('How was your day?', { exact: true }).waitFor();
  const input = page.locator('#tutor-message');
  const send = page.getByRole('button', { name: '메시지 제출하기', exact: true });
  page.once('dialog', dialog => dialog.accept()); await assertMicControl();
  await input.focus(); const original = await input.elementHandle();
  await input.dispatchEvent('compositionstart', { data: '' });
  for (const text of ['오', '늘', '은', ' ', '좋', '아', '요']) await page.keyboard.insertText(text);
  await input.dispatchEvent('compositionend', { data: '오늘은 좋아요' });
  assert.equal(await input.inputValue(), '오늘은 좋아요');
  assert.ok(await original.evaluate(element => element === document.activeElement && element.isConnected));
  await openStudyMenu();
  await page.screenshot({ path: 'test-results/tutor-focus-menu.png' });
  await page.mouse.click(5, 5);
  assert.equal(await page.getByRole('dialog', { name: '학습 메뉴' }).count(), 0, 'backdrop closes without clicking underlying content');
  assert.equal(await input.inputValue(), '오늘은 좋아요');
  await openStudyMenu(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '학습 메뉴' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '학습 메뉴', exact: true }).evaluate(el => el === document.activeElement), true, 'focus returns to menu trigger');
  await page.reload(); await openTutor('header');
  await input.waitFor(); assert.equal(await input.inputValue(), '오늘은 좋아요');
  await input.fill('I ate apple. 오늘은 좋아요'); await send.click();
  await page.locator('.tutor-correction p').waitFor();
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal(await page.locator('.tutor-correction-pair strong').textContent(), 'an apple');
  assert.equal(await input.inputValue(), ''); assert.equal(calls, 1);
  assert.equal(await page.locator('.tutor-expression > p').textContent(), 'I had a nice day today.');
  await page.screenshot({ path: 'test-results/tutor-chat-mobile.png' });
  await switchTab(/복습/);
  await page.getByRole('button', { name: '복습 완료', exact: true }).click();
  await page.getByRole('button', { name: '복습 완료 취소', exact: true }).waitFor();
  await switchTab('학습 설정');
  await page.getByRole('button', { name: 'B1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tutor-levels [aria-pressed="true"]').textContent === 'B1');
  assert.equal((await db.pg.query('select level from tutor_profiles where user_id=$1', [USER_B])).rows[0].level, 'A2');
  await page.getByRole('switch', { name: '다른 표현도 함께 보기' }).click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true');
  await page.screenshot({ path: 'test-results/tutor-settings-mobile.png' });
  await switchTab('대화');

  // A paid answer persisted, but the follow-up read failed: clear the draft, keep the answer.
  await releaseRateLimit(); failRead = true;
  await input.fill('I enjoy learning English at home every day.'); await send.click();
  await page.getByText('답변은 저장됐습니다. 최신 목록은 다시 확인해 주세요.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal(await input.inputValue(), ''); assert.equal(calls, 2);
  failRead = false; await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.tutor-error'));

  // Provider failure retains the exact draft and does not auto-retry.
  await releaseRateLimit(); providerMode = 'balance';
  await input.fill('Please keep my sentence.'); await send.click();
  await page.locator('.tutor-failed').waitFor();
  assert.equal(await input.inputValue(), 'Please keep my sentence.'); assert.equal(calls, 3);
  providerMode = 'ok'; await releaseRateLimit();
  await send.click();
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal(calls, 4);

  // Drop the paid response and the first status read. Explicit recovery reuses the same UUID.
  await releaseRateLimit(); let lost = false;
  await page.route('**/tutor-fixture/functions/v1/english-tutor', async route => {
    const action = route.request().postDataJSON().action;
    if (action === 'send' && !lost) { await route.fetch(); lost = true; failRead = true; return route.abort(); }
    return route.continue();
  });
  await input.fill('I visited the park with my friend yesterday.'); await send.click();
  await page.getByRole('button', { name: '저장 상태 확인' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.tutor-pending button').disabled);
  assert.equal(calls, 5); failRead = false;
  await page.getByRole('button', { name: '저장 상태 확인' }).click();
  await page.waitForFunction(() => !document.querySelector('.tutor-pending'));
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal(calls, 5); assert.equal(await input.inputValue(), '');
  await page.unroute('**/tutor-fixture/functions/v1/english-tutor');

  for (const [width, height] of [[320, 568], [390, 844], [768, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow ${width}`);
    await assertFocusLayout(width, height);
    await page.screenshot({ path: `test-results/tutor-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await assertKeyboardLayout(input, 'tutor-focus-keyboard');
  await page.goBack(); await page.getByText(`VERSION ${APP_VERSION}`, { exact: true }).waitFor();
  await openTutor();
  await page.waitForFunction(() => document.querySelectorAll('.tutor-turn').length === 5);
  const used = (await db.pg.query('select sum(requests)::int as n from tutor_usage where user_id=$1', [USER_A])).rows[0].n;
  page.once('dialog', dialog => dialog.accept()); await menuAction('대화 삭제');
  await page.getByRole('region', { name: '튜터 시작 질문' }).waitFor();
  assert.equal((await db.pg.query('select count(*)::int as n from tutor_turns where user_id=$1', [USER_A])).rows[0].n, 0);
  assert.equal((await db.pg.query('select sum(requests)::int as n from tutor_usage where user_id=$1', [USER_A])).rows[0].n, used);
  await db.pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
  await page.reload(); await page.getByRole('button', { name: '영어 튜터 열기', exact: true }).click(); await page.getByText('아직 연결되지 않았어요', { exact: true }).waitFor();
  assert.equal(await input.count(), 0);

  // The admin can manage access with their own tutor OFF, but cannot read another learner's history.
  await leaveTutor();
  await page.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: /회원관리/ }).click();
  const ownerSwitch = page.locator('.admin-user-list article').filter({ hasText: 'owner@example.invalid' }).getByRole('switch', { name: '영어 튜터', exact: true });
  const learnerSwitch = page.locator('.admin-user-list article').filter({ hasText: 'learner@example.invalid' }).getByRole('switch', { name: '영어 튜터', exact: true });
  await ownerSwitch.click();
  await page.waitForFunction(() => document.querySelector('.admin-user-list article .admin-tutor-access:not(.admin-japanese-access) [role="switch"]').getAttribute('aria-checked') === 'true');
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article .admin-tutor-access:not(.admin-japanese-access) [role="switch"]')[1].getAttribute('aria-checked') === 'false');
  rejectAdminWrite = true; await ownerSwitch.click();
  await page.getByRole('alert').filter({ hasText: '현재 상태를 다시 확인' }).waitFor();
  assert.equal(await ownerSwitch.getAttribute('aria-checked'), 'true'); rejectAdminWrite = false;
  await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.admin-panel [role="alert"]'));
  const ownerTokens = (await db.pg.query('select sum(reported_tokens)::int n from tutor_usage where user_id=$1', [USER_A])).rows[0].n;
  assert.deepEqual(await page.locator('.admin-tutor-usage:not(.admin-japanese-usage) .tutor-token-summary strong').allTextContents(), [ownerTokens.toLocaleString('ko-KR'), ownerTokens.toLocaleString('ko-KR')]);
  assert.match(await page.locator('.admin-tutor-usage:not(.admin-japanese-usage)').textContent(), /사용량 미확인 1건/);
  await page.screenshot({ path: 'test-results/tutor-admin-mobile.png' });
  const learner = await context.newPage(); learner.on('pageerror', error => errors.push(error.message));
  await learner.goto(`${server.resolvedUrls.local[0]}?account=B`);
  await learner.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  assert.equal(await learner.getByRole('button', { name: /회원관리/ }).count(), 0);
  await learner.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await learner.getByRole('button', { name: '영어 튜터 열기', exact: true }).click();
  await learner.getByText('아직 연결되지 않았어요', { exact: true }).waitFor();
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article .admin-tutor-access:not(.admin-japanese-access) [role="switch"]')[1].getAttribute('aria-checked') === 'true');
  await learner.getByRole('button', { name: '다시 확인', exact: true }).click();
  await switchTab('학습 설정', learner);
  await learner.getByRole('button', { name: 'B1+', exact: true }).click();
  await learner.waitForFunction(() => document.querySelector('.tutor-levels [aria-pressed="true"]').textContent === 'B1+');
  assert.equal((await db.pg.query('select level from tutor_profiles where user_id=$1', [USER_A])).rows[0].level, 'B1');
  await switchTab('대화', learner);
  const learnerInput = learner.locator('#tutor-message');
  await learnerInput.fill('This is my own learning history.'); await learner.getByRole('button', { name: '메시지 제출하기' }).click();
  await learner.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal((await db.pg.query('select count(*)::int n from tutor_turns where user_id=$1', [USER_A])).rows[0].n, 0);
  assert.equal((await db.pg.query('select count(*)::int n from tutor_turns where user_id=$1', [USER_B])).rows[0].n, 1);
  await switchTab('학습 설정', learner);
  assert.deepEqual(await learner.locator('.tutor-token-summary strong').allTextContents(), ['400', '400']);
  assert.equal(await learner.locator('.admin-tutor-usage').count(), 0);
  assert.doesNotMatch(await learner.locator('.tutor-header').textContent(), /\/20/);
  await page.getByRole('button', { name: '사용량 새로고침', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.admin-tutor-usage').getAttribute('aria-busy') === 'false');
  const allTokens = (ownerTokens + 400).toLocaleString('ko-KR');
  assert.deepEqual(await page.locator('.admin-tutor-usage:not(.admin-japanese-usage) .tutor-token-summary strong').allTextContents(), [allTokens, allTokens]);
  assert.deepEqual(await page.locator('.admin-user-list article').filter({ hasText: 'learner@example.invalid' }).locator(':scope > .tutor-token-summary strong').allTextContents(), ['400', '400']);
  const beforeUsageReads = calls;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 }); await learner.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await learner.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await learner.locator('.tutor-token-summary').scrollIntoViewIfNeeded();
    await page.locator('.admin-tutor-usage:not(.admin-japanese-usage)').scrollIntoViewIfNeeded();
    await learner.screenshot({ path: `test-results/tutor-own-usage-${width}.png` });
    await page.screenshot({ path: `test-results/tutor-admin-usage-${width}.png` });
  }
  assert.equal(calls, beforeUsageReads, 'viewing counters never invokes the provider');
  await page.setViewportSize({ width: 390, height: 844 });
  await switchTab('대화', learner);
  const beforeRevoke = calls;
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article .admin-tutor-access:not(.admin-japanese-access) [role="switch"]')[1].getAttribute('aria-checked') === 'false');
  await learnerInput.fill('Do not send after access is revoked.'); await learner.getByRole('button', { name: '메시지 제출하기' }).click();
  await learner.getByRole('alert').filter({ hasText: '사용 허가' }).waitFor();
  assert.equal(calls, beforeRevoke);
  await learner.close();
  await page.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await openTutor(); await releaseRateLimit();
  await input.fill("can you recommended dinner menu it's with my wife"); await send.click();
  await page.getByText('이렇게 말해보세요', { exact: true }).waitFor();
  const naturalSentence = "Can you recommend something for dinner? I'm having dinner with my wife.";
  assert.equal(await page.locator('.tutor-expression > p').textContent(), naturalSentence);
  assert.equal(await page.locator('.tutor-correction-pair').count(), 2);
  assert.ok(await page.locator('.tutor-feedback').evaluate(element => element.querySelector('.tutor-expression').compareDocumentPosition(element.querySelector('.tutor-answer')) & Node.DOCUMENT_POSITION_FOLLOWING));
  for (const [width, height] of [[320, 568], [390, 844], [768, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `test-results/tutor-coaching-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(text => { window.__testSpeechText = text; }, naturalSentence);
  const beforePractice = calls;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '다시 말해보기', exact: true }).click();
  await page.getByRole('checkbox', { name: '인식된 문장을 확인했습니다' }).waitFor();
  assert.equal(await input.inputValue(), naturalSentence);
  assert.equal(await send.isDisabled(), true);
  assert.equal(calls, beforePractice, 'practice does not submit automatically');
  await page.getByRole('checkbox', { name: '인식된 문장을 확인했습니다' }).check();
  await releaseRateLimit(); await send.click();
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  const repeated = (await db.pg.query('select feedback from tutor_turns where user_id=$1 and content=$2', [USER_A, naturalSentence])).rows[0];
  assert.equal(repeated.feedback.assessment_eligible, false);
  assert.equal(calls, beforePractice + 1);
  await input.fill('Keep this draft.');
  await menuAction('새 주제 선택');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '카페 주제 시작', exact: true }).click();
  await page.getByRole('region', { name: '튜터 시작 질문' }).waitFor();
  assert.equal(await input.inputValue(), 'Keep this draft.');
  assert.equal(calls, beforePractice + 1);
  // Japanese speaking flow uses its own permission, history, drafts and usage.
  const englishCount = calls;
  await leaveTutor();
  await page.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  const adminAccordion = page.getByRole('button', { name: /회원관리/ });
  if (await adminAccordion.getAttribute('aria-expanded') !== 'true') await adminAccordion.click();
  const japaneseSwitch = page.locator('.admin-user-list article').filter({ hasText: 'owner@example.invalid' }).getByRole('switch', { name: '일본어 튜터', exact: true });
  assert.equal(await japaneseSwitch.getAttribute('aria-checked'), 'false');
  await japaneseSwitch.click();
  await page.waitForFunction(() => document.querySelector('.admin-japanese-access [role="switch"]').getAttribute('aria-checked') === 'true');
  await page.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '일본어 튜터 열기', exact: true }).click();
  await page.getByRole('button', { name: '카페 일본어 시작' }).click();
  await page.getByRole('region', { name: '일본어 시작 질문' }).waitFor();
  assert.equal(japaneseCalls, 0);
  assert.match(await page.locator('.tutor-opening > .japanese-phrase .japanese-reading').textContent(), /나니오 노미마스카/);
  await page.getByRole('button', { name: '첫 질문 듣기', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__lastSpoken), { lang: 'ja-JP', text: '何を飲みますか。', rate: .8 });
  await page.evaluate(() => { window.__noJapaneseVoice = true; });
  await page.getByRole('button', { name: '첫 질문 듣기', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '일본어 음성을 찾지 못했습니다' }).waitFor();
  await page.evaluate(() => { window.__noJapaneseVoice = false; });
  await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.tutor-error'));
  const jpInput = page.locator('#japanese-message'), jpSend = page.getByRole('button', { name: '일본어 메시지 제출하기' });
  await jpInput.focus();
  await page.evaluate(() => { window.__jpNode = document.querySelector('#japanese-message'); });
  await jpInput.fill('커피 주세요');
  assert.equal(await page.evaluate(() => document.activeElement === window.__jpNode && document.querySelector('#japanese-message') === window.__jpNode), true);
  await jpSend.click();
  await page.getByText('이렇게 말해보세요', { exact: true }).waitFor();
  assert.match(await page.locator('.japanese-coaching .japanese-reading').textContent(), /코오히이오 히토츠 쿠다사이/);
  assert.equal(japaneseCalls, 1); assert.equal(calls, englishCount);
  await page.evaluate(() => { window.__testSpeechText = 'コーヒーを一つください。'; });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.japanese-coaching').getByRole('button', { name: '따라 말하기' }).click();
  await page.getByRole('checkbox', { name: '인식된 문장을 확인했습니다' }).waitFor();
  assert.equal(await page.evaluate(() => window.__lastRecognitionLanguage), 'ja-JP');
  assert.equal(await jpInput.inputValue(), 'コーヒーを一つください。');
  assert.equal(await jpSend.isDisabled(), true); assert.equal(japaneseCalls, 1);
  await page.getByRole('checkbox', { name: '인식된 문장을 확인했습니다' }).check();
  await db.pg.exec("update japanese_tutor_usage set last_request_at=now()-interval '10 seconds'");
  await jpSend.click(); await page.waitForFunction(() => document.querySelector('#japanese-message').value === '');
  assert.equal(japaneseCalls, 2);
  for (const [width, height] of [[320, 568], [390, 844], [768, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await assertFocusLayout(width, height);
    await page.screenshot({ path: `test-results/japanese-tutor-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await assertMicControl();
  await assertKeyboardLayout(jpInput, 'japanese-tutor-focus-keyboard');
  await switchTab('학습 설정');
  assert.deepEqual(await page.locator('.tutor-token-summary strong').allTextContents(), ['1,200', '1,200']);
  await page.getByRole('button', { name: '기초 회화', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tutor-levels [aria-pressed="true"]').textContent === '기초 회화');
  assert.equal((await db.pg.query('select level from tutor_profiles where user_id=$1', [USER_A])).rows[0].level, 'B1');
  await switchTab('말하기');
  japaneseMode = 'balance';
  await db.pg.exec("update japanese_tutor_usage set last_request_at=now()-interval '10 seconds'");
  await jpInput.fill('실패해도 유지할 일본어 초안'); await jpSend.click();
  await page.getByRole('alert').filter({ hasText: '잔액' }).waitFor();
  assert.equal(await jpInput.inputValue(), '실패해도 유지할 일본어 초안');
  await page.reload();
  await page.getByRole('button', { name: '일본어 튜터 열기', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.tutor-turn').length === 3);
  assert.equal(await jpInput.inputValue(), '실패해도 유지할 일본어 초안');
  assert.equal(japaneseCalls, 3); assert.equal(calls, englishCount);
  await leaveTutor();
  await openTutor();
  assert.equal(await input.inputValue(), 'Keep this draft.', 'Japanese draft did not overwrite the English draft');
  await leaveTutor();
  await page.evaluate(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  await page.getByRole('button', { name: '일본어 튜터 열기', exact: true }).click();
  await page.getByText('음성 입력 미지원 브라우저입니다. 직접 입력할 수 있어요.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '말하기', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('#japanese-message').isDisabled(), false);
  assert.equal(japaneseCalls, 3);
  assert.ok(network.every(origin => origin === 'https://cdn.jsdelivr.net'), 'only the existing font CDN was requested, and was intercepted');
  assert.deepEqual(errors, []);
  console.log('Tutor browser passed: focus layout and menu dismissal; English regressions; Japanese readings, TTS language, speech confirmation/fallback, draft recovery, permissions and separate usage; 4 viewports. No production network.');
} catch (error) {
  await page.screenshot({ path: 'test-results/tutor-failure.png' });
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); await server.close(); await db.close(); }
