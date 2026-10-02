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
    const typography = await tiles.first().evaluate(el => ({
      dateSize: parseFloat(getComputedStyle(el.querySelector('time')).fontSize),
      amountSize: parseFloat(getComputedStyle(el.querySelector('strong')).fontSize),
      dateDivider: parseFloat(getComputedStyle(el.querySelector('time')).borderBottomWidth),
      textFits: [...el.children].every(child => child.scrollWidth <= child.clientWidth + 1),
    }));
    assert.ok(typography.dateSize >= 16);
    assert.ok(Math.abs(typography.amountSize - typography.dateSize) <= 2);
    assert.ok(typography.dateDivider >= 1);
    assert.ok(typography.textFits);
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
  await select().selectOption('annual_leave');
  for (const [grantDays, usedDays, expectedRate] of [[10.5, 6, 57], [10.5, 7, 67], [10.5, 0, 0], [10.5, 10.5, 100], [10.5, 11, 105], [0, 0, 0]]) {
    await page.evaluate(({ grantDays, usedDays }) => {
      const year = String(new Date().getFullYear());
      window.presentationFixture.setRecords([
        { id: 'test-grant', category_id: 'annual_leave', data: { recordType: 'grant', year, grantDays } },
        { id: 'test-use', category_id: 'annual_leave', data: { recordType: 'use', date: `${year}-01-02`, days: usedDays } },
      ]);
    }, { grantDays, usedDays });
    const progress = page.getByRole('progressbar', { name: '연차 사용률' });
    await page.waitForFunction(rate => document.querySelector('.annual-leave-progress')?.getAttribute('aria-valuetext') === `${rate}%`, expectedRate);
    assert.deepEqual(await page.locator('.annual-leave-stats dt').allTextContents(), ['부여', '사용', '잔여']);
    assert.deepEqual(await page.locator('.annual-leave-stats dd').allTextContents(), [`${grantDays}일`, `${usedDays}일`, `${Math.max(0, grantDays - usedDays)}일`]);
    assert.equal(await page.locator('.annual-leave-meta strong').textContent(), `${expectedRate}%`);
    const expectedWidth = grantDays > 0 ? Math.min(100, usedDays / grantDays * 100) : 0;
    const fill = await progress.locator('span').evaluate(el => parseFloat(el.style.width));
    assert.ok(Math.abs(fill - expectedWidth) < 0.001);
    assert.ok(Number(await progress.getAttribute('aria-valuenow')) <= 100);
    if (usedDays === 6) {
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        const stats = await page.locator('.annual-leave-stats').evaluate(el => ({
          columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
          overflow: el.scrollWidth > el.clientWidth,
          tops: [...el.children].map(child => child.getBoundingClientRect().top),
          dividers: [...el.children].slice(1).map(child => parseFloat(getComputedStyle(child).borderLeftWidth)),
          textFits: [...el.querySelectorAll('dd')].every(child => child.scrollWidth <= child.clientWidth + 1),
        }));
        assert.equal(stats.columns, 3);
        assert.equal(stats.overflow, false);
        assert.equal(new Set(stats.tops).size, 1);
        assert.ok(stats.dividers.every(width => width >= 1));
        assert.ok(stats.textFits);
        await page.locator('.annual-leave-panel').screenshot({ path: `test-results/leave-summary-${width}.png` });
      }
      await page.getByRole('button', { name: '부여 갱신', exact: true }).tap();
      assert.equal(await page.getByTestId('presentation-action').textContent(), 'edit:test-grant');
    }
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
