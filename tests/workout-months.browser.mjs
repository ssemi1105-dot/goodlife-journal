import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const workout = (id, date, data = {}) => ({ id, category_id: 'workout', occurred_on: date, data: { date, activityName: '걷기', activityType: '걷기', distanceMeters: 5000, durationSeconds: 3600, caloriesKcal: 200, ...data } });
const samples = [
  workout('first', '2026-10-04'),
  workout('second', '2026-10-02', { activityName: '달리기', activityType: '달리기', distanceMeters: 3000, durationSeconds: 1800, caloriesKcal: 100 }),
  workout('old', '2025-10-01'),
  workout('unknown', '', { distanceMeters: null, durationSeconds: null, caloriesKcal: null }),
];
const server = await createServer({
  server: { host: '127.0.0.1', port: 5188, strictPort: false }, logLevel: 'silent',
  plugins: [{ name: 'isolated-workout-months', enforce: 'pre', transform(code, id) {
    const path = id.replaceAll('\\', '/').split('?')[0];
    if (path.endsWith('/src/hooks/useAuth.js')) return `export function useAuth(){return {userId:'fixture',session:{user:{id:'fixture'}},profile:{display_name:'테스트'},loading:false,isOwner:false};}`;
    if (path.endsWith('/src/hooks/useAppSettings.js')) return `
      const settings={category_order:['workout'],hidden_categories:[],favorite_categories:[],finance_modes:{},reminder_settings:{}};
      export function useAppSettings(){return {settings,saveSettings:async()=>{},reloadSettings:()=>{}};}`;
    if (path.endsWith('/src/hooks/useRecords.js')) return `
      import {useState} from 'react';
      import {deriveRecordColumns} from '../utils/recordUtils';
      export function useRecords(){
        const [records,setRecords]=useState(${JSON.stringify(samples)});
        window.workoutFixture={records,setRecords};
        return {records,loading:false,reloadRecords:()=>{},exportRecords:async()=>records,
          saveRecord:async(categoryId,data,existing,draftId)=>{
            const next={...existing,id:existing?.id||draftId,category_id:categoryId,data,...deriveRecordColumns(categoryId,data)};
            setRecords(current=>[next,...current.filter(row=>row.id!==next.id)]);
          },deleteRecord:async record=>setRecords(current=>current.filter(row=>row.id!==record.id))};
      }`;
  } }],
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', deviceScaleFactor: 1 });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  return route.abort();
});
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const october = () => page.getByRole('button', { name: '2026년 10월 운동 내역 보기', exact: true });
const modal = () => page.getByRole('dialog', { name: '2026년 10월', exact: true });
const field = label => page.locator('.record-modal .field').filter({ has: page.locator('span', { hasText: label }) }).locator('input').first();
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('.category-tile').filter({ hasText: '운동기록' }).tap();
  await october().waitFor();
  assert.deepEqual(await page.locator('.workout-month-heading > strong').allTextContents(), ['2026년 10월', '2025년 10월', '날짜 미지정']);
  assert.deepEqual(await october().locator('.workout-month-totals strong').allTextContents(), ['8km', '1시간 30분', '300kcal']);
  assert.equal(await page.locator('.category-screen .record-card').count(), 0);
  assert.ok(!(await page.locator('.workout-month-list').textContent()).includes('2026.10.04'));
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/workout-months-${width}.png` });
    await october().tap();
    await modal().waitFor();
    const rect = await modal().boundingBox();
    assert.ok(rect.y > 20 && rect.y + rect.height < 824 && rect.width <= width && rect.height <= 844 * .78);
    assert.ok(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 15)?.classList.contains('workout-month-backdrop')));
    assert.deepEqual(await modal().locator('time').allTextContents(), ['2026.10.04', '2026.10.02']);
    assert.ok(await modal().locator('.workout-month-totals strong').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)));
    await page.screenshot({ path: `test-results/workout-month-entries-${width}.png` });
    await page.goBack();
    await modal().waitFor({ state: 'detached' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goForward();
  await modal().waitFor();
  await page.keyboard.press('Shift+Tab');
  assert.ok(await modal().locator('.workout-month-entry').last().evaluate(node => node === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await modal().getByRole('button', { name: '닫기', exact: true }).evaluate(node => node === document.activeElement));
  await modal().locator('.workout-month-entry').first().tap();
  await page.locator('.navigation-detail-panel').waitFor();
  assert.equal(await modal().count(), 0);
  await page.goBack();
  await modal().waitFor();
  await modal().locator('.workout-month-entry').first().tap();
  await page.getByRole('button', { name: '수정', exact: true }).tap();
  await field('거리(m)').fill('7000');
  await field('날짜').fill('2026-09-30');
  await page.getByRole('button', { name: '저장', exact: true }).tap();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await modal().waitFor();
  assert.equal(await modal().locator('.workout-month-entry').count(), 1);
  assert.deepEqual(await modal().locator('.workout-month-totals strong').allTextContents(), ['3km', '30분', '100kcal']);
  await modal().locator('.workout-month-entry').tap();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '삭제', exact: true }).tap();
  await modal().getByText('이 달에 남아 있는 운동 기록이 없습니다.').waitFor();
  assert.deepEqual(await modal().locator('.workout-month-totals strong').allTextContents(), ['0km', '0초', '0kcal']);
  await page.keyboard.press('Escape');
  await modal().waitFor({ state: 'detached' });
  assert.equal(await october().count(), 0);
  const september = page.getByRole('button', { name: '2026년 9월 운동 내역 보기', exact: true });
  assert.deepEqual(await september.locator('.workout-month-totals strong').allTextContents(), ['7km', '1시간 0분', '200kcal']);
  await september.tap();
  await page.locator('.workout-month-modal').waitFor();
  await page.mouse.click(2, 2);
  await page.locator('.workout-month-modal').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.category-screen h1').textContent(), '운동기록');
  await page.getByRole('button', { name: '날짜 미지정 운동 내역 보기', exact: true }).tap();
  await page.getByRole('dialog', { name: '날짜 미지정', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.workout-month-modal .workout-month-totals strong').allTextContents(), ['미기록', '미기록', '미기록']);
  assert.equal(await page.locator('.workout-month-entry time').textContent(), '일자 미기록');
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.locator('.workout-month-modal').waitFor({ state: 'detached' });
  await page.evaluate(() => window.workoutFixture.setRecords([...window.workoutFixture.records,
    ...Array.from({ length: 25 }, (_, i) => ({ id: `scroll-${i}`, category_id: 'workout', occurred_on: `2026-10-${String(i + 1).padStart(2, '0')}`, data: { activityName: '가벼운 산책', distanceMeters: 1234, durationSeconds: 1234, caloriesKcal: 123 } }))]));
  await october().tap();
  await modal().waitFor();
  assert.ok(await modal().locator('.workout-month-entries').evaluate(node => node.scrollHeight > node.clientHeight));
  await modal().locator('.workout-month-entries').evaluate(node => { node.scrollTop = node.scrollHeight; });
  assert.ok(await modal().locator('.workout-month-entries').evaluate(node => node.scrollTop > 0));
  await page.screenshot({ path: 'test-results/workout-month-scroll.png' });
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await modal().waitFor({ state: 'detached' });
  await page.evaluate(() => window.workoutFixture.setRecords([]));
  await page.getByText('운동 기록이 없습니다.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Workout months passed: totals, year/date grouping, 320/390/768 layout, centered popup, back/forward, focus, edit-date regrouping, delete/empty, outside/Escape dismissal and 25-row scrolling. Production network blocked.');
} catch (error) {
  await page.screenshot({ path: 'test-results/workout-months-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
