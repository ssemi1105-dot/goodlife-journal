import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { activity, chartActivity, tcx } from './helpers/tcxFixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const server = await createServer({
  server: { host: '127.0.0.1', port: 5187, strictPort: false }, logLevel: 'silent',
  plugins: [{ name: 'isolated-workout-test', enforce: 'pre', transform(code, id) {
    const path = id.replaceAll('\\', '/').split('?')[0];
    if (path.endsWith('/src/hooks/useAuth.js')) return `export function useAuth() { return {userId:'fixture',session:{user:{id:'fixture'}},profile:{display_name:'테스트'},loading:false,isOwner:false}; }`;
    if (path.endsWith('/src/hooks/useAppSettings.js')) return `
      const settings={category_order:['workout'],hidden_categories:[],favorite_categories:[],finance_modes:{},reminder_settings:{}};
      export function useAppSettings(){ return {settings,saveSettings:async()=>{},reloadSettings:()=>{}}; }`;
    // The real useRecords hook, parser worker, import service, edit and delete flows run unchanged.
    if (path.endsWith('/src/lib/supabaseClient.js')) return `
      import {fakeDatabase} from '/tests/helpers/tcxFixture.mjs';
      export const supabase=window.workoutDb=fakeDatabase();
      export const isSupabaseConfigured=true, SUPABASE_URL='', SUPABASE_ANON_KEY='';`;
  } }],
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', deviceScaleFactor: 1, timezoneId: 'America/Los_Angeles' });
const nonlocal = [], errors = [];
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  nonlocal.push({ url: url.href, method: route.request().method() });
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const select = xml => page.getByLabel('TCX 파일 선택').setInputFiles({ name: 'synthetic.tcx', mimeType: 'application/xml', buffer: Buffer.from(xml) });
const record = () => page.locator('.workout-month-entry');
const monthModal = () => page.getByRole('dialog', { name: '2026년 10월', exact: true });
async function openMonth() {
  await page.getByRole('button', { name: '2026년 10월 운동 내역 보기', exact: true }).tap();
  await monthModal().waitFor();
}
async function closeMonth() {
  await monthModal().getByRole('button', { name: '닫기', exact: true }).tap();
  await monthModal().waitFor({ state: 'detached' });
}
const field = label => page.locator('.record-modal .field').filter({ has: page.locator('span', { hasText: label }) }).locator('input').first();
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('.category-tile').filter({ hasText: '운동기록' }).tap();
  await page.getByRole('button', { name: 'TCX 가져오기' }).waitFor();
  await select(tcx(activity()));
  await page.getByText('1건 저장 완료', { exact: true }).waitFor();
  await openMonth();
  assert.equal(await record().count(), 1);
  assert.match(await record().textContent(), /걷기/);
  assert.match(await record().textContent(), /2026\.10\.04/);
  assert.match(await record().textContent(), /7.01km/);
  assert.match(await record().textContent(), /1시간 29분 14초/);
  assert.match(await record().textContent(), /442kcal/);
  await closeMonth();
  assert.equal(await page.getByLabel('TCX 파일 선택').inputValue(), '');
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 1);
  const stored = await page.evaluate(() => [...window.workoutDb.rows.values()][0]);
  assert.equal(stored.user_id, 'fixture');
  assert.equal(stored.occurred_on, '2026-10-04');
  assert.ok(!/Latitude|Longitude|coordinates|Trackpoint|rawXml|photos|\.tcx/.test(JSON.stringify(stored)));
  assert.ok(Buffer.byteLength(JSON.stringify(stored.data)) < 1024);
  await select(tcx(activity()));
  await page.getByText('이미 등록된 1건 제외', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.writes.length), 1);

  await select(tcx(chartActivity()));
  await page.getByText('1건 그래프 추가 완료', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 1);
  assert.ok(await page.evaluate(() => [...window.workoutDb.rows.values()][0].data.chart.points.length <= 180));

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/workout-list-${width}.png` });
    await openMonth();
    await page.screenshot({ path: `test-results/workout-month-${width}.png` });
    await record().tap();
    await page.locator('.navigation-detail-panel').waitFor();
    assert.match(await page.locator('.detail-modal').textContent(), /2026-10-04 16:14:21/);
    assert.match(await page.locator('.detail-modal').textContent(), /112bpm/);
    assert.match(await page.locator('.detail-modal').textContent(), /12분 44초\/km/);
    const plot = page.locator('.workout-chart-plot');
    assert.equal(await plot.locator('g[data-series]').count(), 3);
    assert.ok(await plot.locator('path').evaluateAll(nodes => nodes.every(node => node.getAttribute('d')?.includes('L') && !/NaN|Infinity/.test(node.getAttribute('d')))));
    await plot.tap({ position: { x: 100, y: 80 } });
    assert.ok(Number(await page.getByRole('slider', { name: '그래프 시점' }).inputValue()) > 0);
    await page.getByRole('button', { name: '심박 표시' }).tap();
    assert.equal(await plot.locator('g[data-series="심박"]').count(), 0);
    await page.getByRole('button', { name: '심박 표시' }).tap();
    assert.equal(await plot.locator('g[data-series]').count(), 3);
    await page.getByRole('slider', { name: '그래프 시점' }).focus();
    await page.keyboard.press('End');
    const slider = page.getByRole('slider', { name: '그래프 시점' });
    assert.equal(await slider.inputValue(), await slider.getAttribute('max'));
    assert.ok(await page.locator('.workout-chart-legend button').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/workout-detail-${width}.png` });
    await page.getByRole('button', { name: '닫기', exact: true }).tap();
    await page.locator('.navigation-detail-panel').waitFor({ state: 'detached' });
    await closeMonth();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openMonth();
  await record().tap();
  await page.getByRole('button', { name: '수정', exact: true }).tap();
  await field('운동명').fill('산책 수정');
  await field('거리(m)').fill('7500');
  await page.getByRole('button', { name: '저장', exact: true }).tap();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await closeMonth();
  await select(tcx(activity()));
  await page.getByText('이미 등록된 1건 제외', { exact: true }).waitFor();
  await openMonth();
  assert.match(await record().textContent(), /산책 수정/);
  assert.match(await record().textContent(), /7.5km/);
  await closeMonth();

  const retryXml = tcx(activity({ start: '2026-10-03T23:30:00Z' }));
  await page.evaluate(() => { window.workoutDb.failNext = true; });
  await select(retryXml);
  await page.locator('.tcx-import-error').waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 1);
  await page.getByRole('button', { name: '저장 다시 시도' }).tap();
  await page.getByText('1건 저장 완료', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 2);
  assert.equal(await page.evaluate(() => [...window.workoutDb.rows.values()][1].occurred_on), '2026-10-04');

  await select(tcx(activity()).slice(0, -10));
  await page.locator('.tcx-import-error').waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 2);
  await select(tcx(activity({ start: '2026-10-02T01:00:00Z' }), activity({ start: '2026-10-01T01:00:00Z' })));
  await page.getByText('2건 저장 완료', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 4);

  if (process.env.TCX_SAMPLE_PATH) {
    await page.evaluate(() => { const row = [...window.workoutDb.rows.values()].find(row => row.data.activityName === '산책 수정'); delete row.data.chart; });
    await page.getByLabel('TCX 파일 선택').setInputFiles(process.env.TCX_SAMPLE_PATH);
    await page.getByText('1건 그래프 추가 완료', { exact: true }).waitFor();
    await openMonth();
    assert.equal(await record().count(), 4, 'real sample same activity is deduplicated against synthetic fixture');
    await record().filter({ hasText: '산책 수정' }).tap();
    assert.equal(await page.locator('.workout-chart-plot g[data-series]').count(), 3);
    assert.match(await page.locator('.workout-chart > header').textContent(), /32초/);
    await page.screenshot({ path: 'test-results/workout-real-chart.png' });
    await page.getByRole('button', { name: '닫기', exact: true }).tap();
    await closeMonth();
  }
  await openMonth();
  await record().first().tap();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '삭제', exact: true }).tap();
  await page.locator('.navigation-detail-panel').waitFor({ state: 'detached' });
  assert.equal(await record().count(), 3);
  await closeMonth();
  await page.getByRole('button', { name: '추가', exact: true }).tap();
  await page.locator('.record-modal').waitFor();
  await page.locator('.record-modal').getByLabel('TCX 파일 선택').setInputFiles({ name: 'quick.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcx(activity({ start: '2026-09-28T01:00:00Z' }))) });
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.workoutDb.rows.size), 4, 'add modal auto-saves and closes on successful TCX import');
  assert.equal(await page.locator('.workout-month-card').count(), 2, 'September import creates a separate month');
  const privateBrowserData = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
  assert.ok(!/Trackpoint|Latitude|Longitude|rawXml|<Activity/.test(privateBrowserData));
  assert.ok(nonlocal.every(request => request.method === 'GET' && request.url === 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css'), 'only the existing font stylesheet may be requested; all external requests are blocked');
  assert.deepEqual(errors, []);
  console.log('Workout browser passed: local parsing, monthly summaries and detail navigation, graph-only enrichment, three curves, touch/keyboard inspection, toggles, 320/390/768 sizing, duplicate/edit/delete, retry and multi-activity. No external data requests; existing font request blocked.');
} catch (error) {
  await page.screenshot({ path: 'test-results/workout-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
