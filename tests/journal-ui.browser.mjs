import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: false }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  return route.fulfill({ json: [] });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });

try {
  await page.goto(`${server.resolvedUrls.local[0]}tests/ui.html`);
  await page.locator('.journal-home').waitFor();
  const categoryIds = await page.evaluate(() => window.fixture.settings.category_order);
  await page.evaluate(() => {
    const { records, settings } = window.fixture;
    window.fixture.setSettings({ ...settings, hidden_categories: ['shopping'] });
    window.fixture.setRecords([...records, ...Array.from({ length: 4 }, (_, i) => ({
      ...records[0], id: `dining-${i}`, category_id: 'dining', data: { ...records[0].data, restaurant: `점심 식당 ${i}` },
    }))]);
  });
  await page.waitForFunction(() => window.fixture.records.length === 6);
  const before = await page.evaluate(() => JSON.stringify({ records: window.fixture.records, settings: window.fixture.settings }));
  assert.equal(await page.locator('.journal-home-record').count(), 3);
  assert.equal(await page.locator('.journal-favorite-button').count(), 1);
  const nav = page.getByRole('navigation');
  assert.deepEqual(await nav.locator('button').allTextContents(), ['홈', '전체 카테고리', '설정']);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const navBox = await nav.boundingBox();
    assert.ok(Math.abs(navBox.y + navBox.height - 844) < 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `test-results/journal-home-${width}.png` });
    await nav.getByRole('button', { name: '전체 카테고리', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: '전체 카테고리', exact: true });
    await dialog.waitFor();
    const actual = await dialog.locator('[data-category-id]').evaluateAll(nodes => nodes.map(el => el.dataset.categoryId));
    assert.deepEqual([...actual].sort(), [...categoryIds].sort());
    assert.match(await dialog.locator('[data-category-id="shopping"]').textContent(), /홈 숨김/);
    const measure = await dialog.locator('.category-browser-grid').evaluate(el => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      overflow: el.scrollWidth > el.clientWidth,
      centered: [...el.children].every(card => getComputedStyle(card).alignItems === 'center' && getComputedStyle(card).textAlign === 'center'),
      textFits: [...el.querySelectorAll('strong,small')].every(text => text.scrollWidth <= text.clientWidth + 1),
    }));
    assert.equal(measure.columns, 3);
    assert.equal(measure.overflow, false);
    assert.equal(measure.centered, true);
    assert.equal(measure.textFits, true);
    const scroll = dialog.locator('.category-browser-scroll');
    assert.ok(await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollHeight <= el.clientHeight || el.scrollTop > 0; }));
    await scroll.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/journal-categories-${width}.png` });
    // A background tap must dismiss only, never open an underlying category.
    await page.locator('.category-browser-backdrop').tap({ position: { x: 2, y: 2 } });
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.journal-home').count(), 1);
    assert.equal(await page.locator('.app-shell').evaluate(el => el.inert), false);
    await page.getByRole('button', { name: '자주 사용한 카테고리 보기', exact: true }).tap();
    const frequent = page.getByRole('dialog', { name: '자주 사용한 카테고리', exact: true });
    assert.deepEqual(await frequent.locator('[data-category-id]').evaluateAll(nodes => nodes.map(el => el.dataset.categoryId)), ['dining', ...categoryIds.filter(id => ['workMeal', 'salary'].includes(id))]);
    assert.equal(await frequent.locator('.category-browser-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
    await page.screenshot({ path: `test-results/journal-frequent-${width}.png` });
    await page.keyboard.press('Escape');
    await frequent.waitFor({ state: 'detached' });
  }
  assert.equal(await page.evaluate(() => JSON.stringify({ records: window.fixture.records, settings: window.fixture.settings })), before);
  await page.setViewportSize({ width: 390, height: 844 });
  await nav.getByRole('button', { name: '전체 카테고리', exact: true }).tap();
  await page.locator('[data-category-id="dining"]').tap();
  await page.locator('.category-screen').waitFor();
  assert.equal(await page.locator('.record-card').count(), 4);
  await page.screenshot({ path: 'test-results/journal-dining.png' });
  await nav.getByRole('button', { name: '설정', exact: true }).tap();
  assert.deepEqual(await page.locator('.settings-section-toggle h2').allTextContents(), ['내 프로필', '친구/공유', '카테고리 설정', '내 데이터', '알림/연동']);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const overlap = await page.locator('.settings-section-toggle').evaluateAll(rows => rows.some(row => {
      const rects = [...row.children].filter(el => getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect());
      return rects.some((r, i) => rects.slice(i + 1).some(s => Math.min(r.right, s.right) - Math.max(r.left, s.left) > 1 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 1));
    }));
    assert.equal(overlap, false, `settings overlap ${width}`);
    await page.screenshot({ path: `test-results/journal-settings-${width}.png` });
  }
  await page.getByRole('button', { name: /카테고리 설정/ }).first().tap();
  assert.equal(await page.locator('.category-setting-card').count(), categoryIds.length);
  await page.locator('.settings-screen').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator('.settings-screen').evaluate(el => el.scrollTop > 0));
  assert.deepEqual(errors, []);
  console.log('PASS: all categories retained, 3-column centered all/frequent cards at 4 widths, favorites, recent 3, no click-through, scroll, unchanged records/settings, dining and settings preserved. Production network blocked.');
} finally {
  await browser.close();
  await server.close();
}
