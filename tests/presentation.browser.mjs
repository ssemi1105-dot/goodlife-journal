import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: false }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/tests/missing-poster.jpg') return route.fulfill({ status: 404, body: '' });
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  // No production data or external services may be accessed by the fixture.
  return route.fulfill({ json: [] });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const card = id => page.locator(`[data-record-id="${id}"] .record-card`);
const select = () => page.getByLabel('테스트 카테고리');
await mkdir('test-results', { recursive: true });
const results = [];

try {
  await page.goto(`${server.resolvedUrls.local[0]}tests/ui.html?presentation`);
  await card('dining').waitFor();
  assert.equal(await card('shopping').locator('.shopping-item-preview li:not(.is-more)').count(), 10);
  assert.match(await card('shopping').textContent(), /외 2개/);
  assert.match(await card('shopping').locator('h3').textContent(), /테스트 구매처/);
  assert.match(await card('subscription').textContent(), /비활성/);
  assert.match(await card('hospital').locator('.record-primary-value').textContent(), /0원/);
  assert.equal(await card('exercise').locator('.record-measures > div').count(), 4);
  assert.equal((await card('investment').textContent()).match(/180,000원/g)?.length, 1);
  await card('video').locator('.record-image-fallback').waitFor();

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.evaluate(() => {
      const noPhotoBodies = [...document.querySelectorAll('.record-preview-layout:not(.has-photo) .record-preview-body')];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        bodyFillsCard: noPhotoBodies.every(el => el.getBoundingClientRect().width > el.closest('.record-card').getBoundingClientRect().width * 0.85),
        amountsFit: [...document.querySelectorAll('.record-primary-value')].every(el => el.scrollWidth <= el.clientWidth + 1),
        overlap: [...document.querySelectorAll('.record-preview-main')].some(row => {
          const [a, b] = [...row.children].map(el => el.getBoundingClientRect());
          return a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        }),
      };
    });
    assert.equal(metrics.overflow, false, `page overflow ${width}`);
    assert.equal(metrics.bodyFillsCard, true, `body width ${width}`);
    assert.equal(metrics.amountsFit, true, `amount width ${width}`);
    assert.equal(metrics.overlap, false, `title/amount overlap ${width}`);
    for (const id of ['dining', 'shopping', 'hospital', 'exercise']) {
      await card(id).screenshot({ path: `test-results/presentation-${id}-${width}.png` });
    }

    // Open every category's real detail component using only synthetic records.
    const ids = await page.evaluate(() => window.presentationFixture.records.filter(r => !r.id.startsWith('leave-')).map(r => r.id));
    for (const id of ids) {
      await card(id).tap({ position: { x: 35, y: 35 } });
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${id} detail overflow ${width}`);
      if (id !== 'annual_leave') assert.equal(await dialog.locator('.record-detail-grid').count(), 1);
      if (id === 'overseasTravel') assert.match(await dialog.locator('.record-detail-items').textContent(), /JPY/);
      if (id === 'subscription') assert.match(await dialog.textContent(), /비활성/);
      if (id === 'dining' && width === 390) await page.screenshot({ path: 'test-results/presentation-dining-detail.png' });
      await dialog.getByRole('button', { name: '닫기', exact: true }).tap();
    }

    await select().selectOption('annual_leave');
    const tiles = page.locator('.leave-day-tile');
    assert.equal(await tiles.count(), 13);
    assert.equal(await page.locator('.leave-grant-row').count(), 1);
    const grid = await page.locator('.leave-keypad-grid').evaluate(el => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      boxes: [...el.children].map(child => { const r = child.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
      overflow: el.scrollWidth > el.clientWidth,
    }));
    assert.equal(grid.columns, 4, `leave columns ${width}`);
    assert.equal(grid.overflow, false);
    assert.equal(new Set(grid.boxes.slice(0, 4).map(b => b.y)).size, 1);
    assert.ok(grid.boxes[4].y > grid.boxes[0].y);
    assert.ok(grid.boxes.every(b => b.width >= 58 && b.height >= 70));
    assert.match(await tiles.nth(1).textContent(), /0.5/);
    assert.equal(await tiles.locator('.compact-record-weather,.record-actions,.rating-preview').count(), 0);
    await page.locator('.leave-year-section').screenshot({ path: `test-results/presentation-leave-${width}.png` });
    await tiles.first().tap();
    await page.getByRole('dialog').getByRole('button', { name: '수정', exact: true }).tap();
    assert.equal(await page.getByTestId('presentation-action').textContent(), 'edit:leave-12');
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).tap();
    assert.equal(await page.getByTestId('presentation-action').textContent(), 'delete:leave-12');
    await page.getByRole('button', { name: '닫기', exact: true }).tap();
    results.push({ width, ...metrics, leaveColumns: grid.columns, testedDetails: ids.length });
    await select().selectOption('all');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results, checks: 'All category details, full-width cards, no overlapping amounts, false/zero values, local currency, missing poster, 4-column leave dates/days and detail actions. Production network blocked.' }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'test-results/presentation-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
