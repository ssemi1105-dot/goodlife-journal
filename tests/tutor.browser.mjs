import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { createTutorDatabase, USER_A, USER_B, SESSION_A, feedbackFor } from './helpers/tutorDatabase.mjs';
import { createTutorHandler } from '../supabase/functions/english-tutor/handler.mjs';
import { APP_VERSION } from '../src/lib/appVersion.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const db = await createTutorDatabase();
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
    start() { this.onstart?.(); queueMicrotask(() => { this.onresult?.({ results: [[{ transcript: window.__testSpeechText || 'I would like pasta.' }]] }); this.onend?.(); }); }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
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
const openTutor = async (entry = 'category') => {
  await (entry === 'category' ? page.getByRole('button', { name: '영어 튜터 열기', exact: true }) : page.locator('.tutor-launch-button')).click();
  await page.getByRole('tab', { name: '대화', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.tutor-state[role="status"]'));
};
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByText(`VERSION ${APP_VERSION}`, { exact: true }).waitFor();
  assert.equal(await page.locator('.category-grid > button').first().getAttribute('aria-label'), '영어 튜터 열기');
  assert.equal(calls, 0, 'showing the shortcut does not call Hive');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.tutor-category-tile').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.tutor-category-tile strong').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), `tutor label fits ${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `home overflow ${width}`);
    await page.screenshot({ path: `test-results/tutor-category-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openTutor();
  await page.getByText('How was your day?', { exact: true }).waitFor();
  await page.getByRole('button', { name: '새 주제 선택', exact: true }).click();
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
  await page.getByLabel('대화 선택').selectOption(SESSION_A);
  await page.getByText('How was your day?', { exact: true }).waitFor();
  const input = page.getByRole('textbox', { name: /메시지/ });
  const send = page.getByRole('button', { name: '메시지 전송', exact: true });
  await input.focus(); const original = await input.elementHandle();
  await input.dispatchEvent('compositionstart', { data: '' });
  for (const text of ['오', '늘', '은', ' ', '좋', '아', '요']) await page.keyboard.insertText(text);
  await input.dispatchEvent('compositionend', { data: '오늘은 좋아요' });
  assert.equal(await input.inputValue(), '오늘은 좋아요');
  assert.ok(await original.evaluate(element => element === document.activeElement && element.isConnected));
  await page.reload(); await openTutor('header');
  await input.waitFor(); assert.equal(await input.inputValue(), '오늘은 좋아요');
  await input.fill('I ate apple. 오늘은 좋아요'); await send.click();
  await page.locator('.tutor-correction p').waitFor();
  await page.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal(await page.locator('.tutor-correction-pair strong').textContent(), 'an apple');
  assert.equal(await input.inputValue(), ''); assert.equal(calls, 1);
  assert.equal(await page.locator('.tutor-expression > p').textContent(), 'I had a nice day today.');
  await page.screenshot({ path: 'test-results/tutor-chat-mobile.png' });
  await page.getByRole('tab', { name: /복습/ }).click();
  await page.getByRole('button', { name: '복습 완료', exact: true }).click();
  await page.getByRole('button', { name: '복습 완료 취소', exact: true }).waitFor();
  await page.getByRole('tab', { name: '학습 설정' }).click();
  await page.getByRole('button', { name: 'B1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tutor-header').textContent.includes('B1'));
  assert.equal((await db.pg.query('select level from tutor_profiles where user_id=$1', [USER_B])).rows[0].level, 'A2');
  await page.getByRole('switch', { name: '다른 표현도 함께 보기' }).click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true');
  await page.screenshot({ path: 'test-results/tutor-settings-mobile.png' });
  await page.getByRole('tab', { name: '대화', exact: true }).click();

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
    const nav = await page.locator('.bottom-nav').boundingBox(), composer = await page.locator('.tutor-composer').boundingBox();
    assert.ok(Math.abs(nav.y + nav.height - height) < 2, 'nav is fixed');
    assert.ok(composer.y + composer.height <= nav.y + 1, 'composer is above nav');
    await page.screenshot({ path: `test-results/tutor-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goBack(); await page.getByText(`VERSION ${APP_VERSION}`, { exact: true }).waitFor();
  await openTutor();
  await page.waitForFunction(() => document.querySelectorAll('.tutor-turn').length === 5);
  const used = (await db.pg.query('select sum(requests)::int as n from tutor_usage where user_id=$1', [USER_A])).rows[0].n;
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '대화 삭제', exact: true }).click();
  await page.getByRole('region', { name: '튜터 시작 질문' }).waitFor();
  assert.equal((await db.pg.query('select count(*)::int as n from tutor_turns where user_id=$1', [USER_A])).rows[0].n, 0);
  assert.equal((await db.pg.query('select sum(requests)::int as n from tutor_usage where user_id=$1', [USER_A])).rows[0].n, used);
  await db.pg.query('update tutor_access set enabled=false where user_id=$1', [USER_A]);
  await page.reload(); await page.getByRole('button', { name: '영어 튜터 열기', exact: true }).click(); await page.getByText('아직 연결되지 않았어요', { exact: true }).waitFor();
  assert.equal(await input.count(), 0);

  // The admin can manage access with their own tutor OFF, but cannot read another learner's history.
  await page.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: /회원관리/ }).click();
  const ownerSwitch = page.locator('.admin-user-list article').filter({ hasText: 'owner@example.invalid' }).getByRole('switch');
  const learnerSwitch = page.locator('.admin-user-list article').filter({ hasText: 'learner@example.invalid' }).getByRole('switch');
  await ownerSwitch.click();
  await page.waitForFunction(() => document.querySelector('.admin-user-list article [role="switch"]').getAttribute('aria-checked') === 'true');
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article [role="switch"]')[1].getAttribute('aria-checked') === 'false');
  rejectAdminWrite = true; await ownerSwitch.click();
  await page.getByRole('alert').filter({ hasText: '현재 상태를 다시 확인' }).waitFor();
  assert.equal(await ownerSwitch.getAttribute('aria-checked'), 'true'); rejectAdminWrite = false;
  await page.getByRole('button', { name: '권한 다시 확인' }).click();
  await page.waitForFunction(() => !document.querySelector('.admin-panel [role="alert"]'));
  await page.screenshot({ path: 'test-results/tutor-admin-mobile.png' });
  const learner = await context.newPage(); learner.on('pageerror', error => errors.push(error.message));
  await learner.goto(`${server.resolvedUrls.local[0]}?account=B`);
  await learner.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  assert.equal(await learner.getByRole('button', { name: /회원관리/ }).count(), 0);
  await learner.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await learner.getByRole('button', { name: '영어 튜터 열기', exact: true }).click();
  await learner.getByText('아직 연결되지 않았어요', { exact: true }).waitFor();
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article [role="switch"]')[1].getAttribute('aria-checked') === 'true');
  await learner.getByRole('button', { name: '다시 확인', exact: true }).click();
  await learner.getByRole('tab', { name: '학습 설정' }).click();
  await learner.getByRole('button', { name: 'B1+', exact: true }).click();
  await learner.waitForFunction(() => document.querySelector('.tutor-header').textContent.includes('B1+'));
  assert.equal((await db.pg.query('select level from tutor_profiles where user_id=$1', [USER_A])).rows[0].level, 'B1');
  await learner.getByRole('tab', { name: '대화', exact: true }).click();
  const learnerInput = learner.getByRole('textbox', { name: /메시지/ });
  await learnerInput.fill('This is my own learning history.'); await learner.getByRole('button', { name: '메시지 전송' }).click();
  await learner.waitForFunction(() => document.querySelector('#tutor-message').value === '');
  assert.equal((await db.pg.query('select count(*)::int n from tutor_turns where user_id=$1', [USER_A])).rows[0].n, 0);
  assert.equal((await db.pg.query('select count(*)::int n from tutor_turns where user_id=$1', [USER_B])).rows[0].n, 1);
  const beforeRevoke = calls;
  await learnerSwitch.click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-user-list article [role="switch"]')[1].getAttribute('aria-checked') === 'false');
  await learnerInput.fill('Do not send after access is revoked.'); await learner.getByRole('button', { name: '메시지 전송' }).click();
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
  await page.getByRole('button', { name: '새 주제 선택', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '카페 주제 시작', exact: true }).click();
  await page.getByRole('region', { name: '튜터 시작 질문' }).waitFor();
  assert.equal(await input.inputValue(), 'Keep this draft.');
  assert.equal(calls, beforePractice + 1);
  assert.ok(network.every(origin => origin === 'https://cdn.jsdelivr.net'), 'only the existing font CDN was requested, and was intercepted');
  assert.deepEqual(errors, []);
  console.log('Tutor browser passed: topics/first questions, recovery without charge, coaching/practice, mock speech confirmation, legacy review, IME, 4 viewports, admin permissions and account isolation. No production network.');
} catch (error) {
  await page.screenshot({ path: 'test-results/tutor-failure.png' });
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); await server.close(); await db.close(); }
