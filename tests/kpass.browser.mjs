import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const samples = [
  { id: 'charge', category_id: 'kpass', occurred_on: '2026-10-01', amount: 50000, data: { yearMonth: '2026-10', date: '2026-10-02', chargeAmount: 50000, memo: '첫 충전' } },
  { id: 'charge2', category_id: 'kpass', occurred_on: '2026-10-01', amount: 50000, data: { yearMonth: '2026-10', date: '2026-10-15', chargeAmount: 50000 } },
  { id: 'refund', category_id: 'kpass', occurred_on: '2026-10-01', amount: 0, data: { yearMonth: '2026-10', date: '2026-11-05', refundAmount: 20000, memo: '10월분 환급' } },
  { id: 'old', category_id: 'kpass', occurred_on: '2025-10-01', data: { yearMonth: '2025-10', chargeAmount: 30000, refundAmount: 3000 } },
  { id: 'legacy', category_id: 'kpass', occurred_on: '2026-09-01', data: { chargeAmount: 10000 } },
  { id: 'unknown', category_id: 'kpass', data: { refundAmount: 1000 } },
];
const server = await createServer({
  server: { host: '127.0.0.1', port: 5186, strictPort: false }, logLevel: 'silent',
  plugins: [{
    name: 'isolated-kpass-test-data', enforce: 'pre',
    transform(code, id) {
      const path = id.replaceAll('\\', '/').split('?')[0];
      if (path.endsWith('/src/hooks/useAuth.js')) return `export function useAuth() { return { userId:'fixture', session:{user:{id:'fixture'}}, profile:{display_name:'테스트'}, loading:false, isOwner:false }; }`;
      if (path.endsWith('/src/hooks/useAppSettings.js')) return `
        const settings = {category_order:['kpass'],hidden_categories:[],favorite_categories:[],finance_modes:{},reminder_settings:{}};
        export function useAppSettings() { return {settings,saveSettings:async()=>{},reloadSettings:()=>{}}; }`;
      if (path.endsWith('/src/hooks/useRecords.js')) return `
        import { useState } from 'react';
        import { deriveRecordColumns } from '../utils/recordUtils';
        export function useRecords() {
          const [records,setRecords] = useState(${JSON.stringify(samples)});
          window.kpassFixture = {records,setRecords};
          return {records,loading:false,reloadRecords:()=>{},exportRecords:async()=>records,
            saveRecord:async(categoryId,data,existing,draftId)=>{
              const next={...existing,id:existing?.id||draftId,category_id:categoryId,data,...deriveRecordColumns(categoryId,data)};
              window.kpassSaved=next;
              setRecords(current=>[next,...current.filter(row=>row.id!==next.id)]);
            },
            deleteRecord:async(record)=>setRecords(current=>current.filter(row=>row.id!==record.id))
          };
        }`;
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', deviceScaleFactor: 1 });
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
  // All data is synthetic; never access the user's Supabase, photos or APIs.
  return route.fulfill({ json: [] });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const october = () => page.getByRole('button', { name: '2026년 10월 내역 보기', exact: true });
const modal = () => page.getByRole('dialog', { name: '2026년 10월', exact: true });
const field = (label) => page.locator('.record-modal .field').filter({ has: page.locator('span', { hasText: label }) }).locator('input').first();
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('.category-tile').filter({ hasText: 'K-pass' }).tap();
  await october().waitFor();
  assert.equal(await page.locator('.kpass-month-card').count(), 4);
  assert.equal(await page.locator('.category-screen .record-card').count(), 0);
  assert.deepEqual(await page.locator('.kpass-summary-strip strong').allTextContents(), ['140,000원', '24,000원', '17.1%']);
  assert.deepEqual(await october().locator('.kpass-amounts strong').allTextContents(), ['100,000원', '20,000원']);
  assert.ok(!(await page.locator('.category-screen').textContent()).includes('순비용'));
  assert.ok(!(await page.locator('.kpass-month-list').textContent()).includes('2026-10-02'));

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.kpass-summary-strip strong').evaluateAll((nodes) => nodes.every(el => el.scrollWidth <= el.clientWidth + 1)));
    await page.screenshot({ path: `test-results/kpass-months-${width}.png` });
    await october().tap();
    await modal().waitFor();
    const rect = await modal().boundingBox();
    assert.ok(rect.y > 20 && rect.y + rect.height < 824 && rect.width <= width);
    assert.ok(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 15)?.classList.contains('kpass-month-backdrop')), 'backdrop blocks the navigation underneath');
    assert.deepEqual(await page.locator('.kpass-transaction time').allTextContents(), ['2026.11.05', '2026.10.15', '2026.10.02']);
    await page.screenshot({ path: `test-results/kpass-detail-${width}.png` });
    await page.goBack();
    await modal().waitFor({ state: 'detached' });
    assert.equal(await page.locator('.category-screen h1').textContent(), 'K-pass');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goForward();
  await modal().waitFor();
  await page.locator('.kpass-transaction').first().tap();
  await page.locator('.navigation-detail-panel').waitFor();
  assert.equal(await modal().count(), 0);
  assert.ok(!(await page.locator('.detail-modal').textContent()).includes('순비용'));
  await page.getByRole('button', { name: '수정', exact: true }).tap();
  await page.locator('.record-modal').waitFor();
  assert.equal(await field('날짜').inputValue(), '2026-11-05');
  assert.ok(!(await page.locator('.record-modal').textContent()).includes('순비용'));
  await field('환급비용').fill('25000');
  await field('날짜').fill('2026-11-06');
  await page.getByRole('button', { name: '저장', exact: true }).tap();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.kpassSaved.occurred_on), '2026-11-06');
  assert.equal(await page.evaluate(() => window.kpassSaved.data.yearMonth), '2026-10');
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await modal().waitFor();
  assert.deepEqual(await modal().locator('.kpass-amounts strong').allTextContents(), ['100,000원', '25,000원']);
  assert.equal(await page.locator('.kpass-transaction time').first().textContent(), '2026.11.06');

  await page.locator('.kpass-transaction').first().tap();
  await page.locator('.navigation-detail-panel').waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '삭제', exact: true }).tap();
  await modal().waitFor();
  assert.equal(await page.locator('.kpass-transaction').count(), 2);
  assert.deepEqual(await modal().locator('.kpass-amounts strong').allTextContents(), ['100,000원', '0원']);
  await page.keyboard.press('Escape');
  await modal().waitFor({ state: 'detached' });
  await october().tap();
  await modal().waitFor();
  await page.mouse.click(2, 2);
  await modal().waitFor({ state: 'detached' });
  assert.equal(await page.locator('.category-screen h1').textContent(), 'K-pass');

  await page.getByRole('button', { name: '2025년 10월 내역 보기', exact: true }).tap();
  await page.getByRole('dialog', { name: '2025년 10월' }).waitFor();
  assert.equal(await page.locator('.kpass-transaction time').textContent(), '일자 미기록');
  assert.match(await page.locator('.kpass-transaction-values').textContent(), /충전.*30,000원.*환급.*3,000원/);
  await page.locator('.kpass-transaction').tap();
  await page.locator('.navigation-detail-panel').waitFor();
  await page.getByRole('button', { name: '수정', exact: true }).tap();
  await page.locator('.record-modal').waitFor();
  assert.equal(await field('날짜').inputValue(), '', 'legacy synthetic first-of-month must not be silently saved as a real date');
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.locator('.navigation-detail-panel').waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.getByRole('dialog', { name: '2025년 10월' }).waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.locator('.kpass-month-modal').waitFor({ state: 'detached' });

  await page.evaluate(() => window.kpassFixture.setRecords([...window.kpassFixture.records,
    ...Array.from({ length: 25 }, (_, i) => ({ id: `scroll-${i}`, category_id: 'kpass', data: { yearMonth: '2026-10', date: `2026-10-${String(i + 1).padStart(2, '0')}`, chargeAmount: 1000 } }))]));
  await october().tap();
  await modal().waitFor();
  assert.ok(await page.locator('.kpass-transactions').evaluate(el => el.scrollHeight > el.clientHeight));
  await page.locator('.kpass-transactions').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator('.kpass-transactions').evaluate(el => el.scrollTop > 0));
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await modal().waitFor({ state: 'detached' });
  await page.evaluate(() => window.kpassFixture.setRecords([]));
  await page.getByText('K-pass 기록이 없습니다.').waitFor();
  assert.deepEqual(await page.locator('.kpass-summary-strip strong').allTextContents(), ['0원', '0원', '0.0%']);
  await page.getByRole('button', { name: '추가', exact: true }).tap();
  await page.locator('.record-modal').waitFor();
  await field('연월').fill('2026-13');
  await page.getByRole('button', { name: '저장', exact: true }).tap();
  await page.getByRole('alert').filter({ hasText: 'YYYY-MM' }).waitFor();
  await field('연월').fill('2026-12');
  await field('날짜').fill('2027-01-05');
  await field('환급비용').fill('20000');
  await page.getByRole('button', { name: '저장', exact: true }).tap();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '2026년 12월 내역 보기', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.kpassSaved.occurred_on), '2027-01-05');
  assert.equal(await page.evaluate(() => Number(window.kpassSaved.data.netCost)), 0);
  assert.deepEqual(await page.locator('.kpass-summary-strip strong').allTextContents(), ['0원', '20,000원', '0.0%']);
  assert.deepEqual(errors, []);
  console.log('K-pass browser passed: monthly totals, actual dates, mobile sizing, history back/forward, edit/delete recalculation, outside/Escape dismiss, scrolling, legacy and empty states. Production network blocked.');
} catch (error) {
  await page.screenshot({ path: 'test-results/kpass-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
