import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { APP_VERSION } from '../src/lib/appVersion.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5184, strictPort: false }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
  if (url.pathname.endsWith('/records') || url.pathname.endsWith('/app_settings')) {
    const userId = (url.searchParams.get('user_id') || '').replace('eq.', '');
    if (userId === 'A') await new Promise((resolve) => setTimeout(resolve, 300));
    const rows = url.pathname.endsWith('/records')
      ? [{ id: userId, user_id: userId, category_id: 'dining', occurred_on: '2026-10-01', data: {} }]
      : [{ user_id: userId, finance_modes: { __favorite_categories: [userId] } }];
    return route.fulfill({ json: rows, headers: { 'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
  }
  if (url.hostname.includes('open-meteo')) return route.fulfill({ json: { daily: { weathercode: [0], temperature_2m_max: [23], temperature_2m_min: [15] } } });
  // Never contact production services or send real user data in this test.
  return route.fulfill({ json: [] });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${server.resolvedUrls.local[0]}tests/ui.html`);
  await page.getByText(`VERSION ${APP_VERSION}`, { exact: true }).waitFor();
  const navBox = await page.locator('.bottom-nav').boundingBox();
  assert.ok(Math.abs(navBox.y + navBox.height - 844) < 2);
  assert.ok(navBox.height < 100);
  assert.deepEqual(await page.locator('.section-title h2').allTextContents(), ['빠른 기록', '최근 기록', '전체 카테고리']);
  for (const period of ['분기별', '연간', '주간', '월간']) {
    await page.locator('.summary-cycle-button').click();
    assert.equal(await page.locator('.summary-cycle-button small').textContent(), period);
    assert.equal(await page.locator('.finance-summary-modal').count(), 0);
  }
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await page.locator('.finance-modal-grid button').nth(1).click();
  assert.match(await page.locator('.finance-breakdown').textContent(), /월급/);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.screenshot({ path: 'test-results/home-mobile.png' });

  await page.evaluate(() => window.fixture.editMeal());
  await page.locator('.line-item-main input').nth(1).fill('12000');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.fixture.saved.amount), 12000);
  await page.evaluate(() => { window.fixture.attemptIds = []; });

  await page.locator('.quick-category-button').filter({ hasText: '회사식사' }).click();
  assert.equal(await page.locator('.record-modal').count(), 1);
  await page.locator('.field').filter({ has: page.locator('span', { hasText: '식당명' }) }).locator('input').fill('테스트 식당');
  assert.equal(await page.locator('.line-item-row').count(), 1);
  const input = page.locator('.line-item-main input').first();
  await input.focus();
  const original = await input.elementHandle();
  await input.dispatchEvent('compositionstart', { data: '' });
  for (const character of ['김', '치', '찌', '개']) await page.keyboard.insertText(character);
  await input.dispatchEvent('compositionend', { data: '김치찌개' });
  assert.equal(await input.inputValue(), '김치찌개');
  assert.ok(await original.evaluate((element) => element === document.activeElement && element.isConnected));
  await page.locator('.line-item-main input').nth(1).fill('12000');
  assert.match(await page.locator('.line-total').textContent(), /12,000/);
  await page.getByRole('button', { name: '메뉴 추가' }).click();
  const secondName = page.locator('.line-item-row').nth(1).locator('input').first();
  await secondName.fill('계란말이');
  await page.locator('.line-item-row').nth(1).locator('input').nth(1).fill('3000');
  assert.match(await page.locator('.line-total').textContent(), /15,000/);
  await page.evaluate(() => { window.fixture.failSave = true; });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('테스트 저장 실패').waitFor();
  assert.equal(await input.inputValue(), '김치찌개');
  assert.equal(await secondName.inputValue(), '계란말이');
  await page.screenshot({ path: 'test-results/failed-save-mobile.png' });
  await page.evaluate(() => { window.fixture.failSave = false; });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('.record-modal').waitFor({ state: 'detached' });
  const saved = await page.evaluate(() => ({ amount: window.fixture.saved.amount, ids: window.fixture.attemptIds }));
  assert.equal(saved.amount, 15000);
  assert.equal(new Set(saved.ids).size, 1);

  await page.evaluate(() => window.fixture.openForm('salary'));
  await page.locator('.field').filter({ has: page.locator('span', { hasText: '세전' }) }).locator('input').first().fill('3000000');
  await page.locator('.field').filter({ has: page.locator('span', { hasText: '세금' }) }).locator('input').first().fill('300000');
  assert.equal(await page.locator('input[readonly]').inputValue(), '2700000');
  await page.getByRole('button', { name: '닫기', exact: true }).click();

  await page.getByRole('navigation').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: /내 데이터/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /기록·설정 백업/ }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.recordCount, 3);
  assert.equal(backup.schemaVersion, 2);
  assert.equal(backup.settings.finance_modes.workMeal, 'excluded');
  assert.equal(backup.photosIncluded, false);
  await page.getByRole('button', { name: /카테고리 설정/ }).first().click();
  await page.screenshot({ path: 'test-results/settings-mobile.png' });
  const settingsScroll = await page.locator('main').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight };
  });
  assert.ok(settingsScroll.height <= settingsScroll.client || settingsScroll.top > 0);
  const navAfter = await page.locator('.bottom-nav').boundingBox();
  assert.ok(Math.abs(navAfter.y + navAfter.height - 844) < 2);
  assert.deepEqual(errors, []);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('navigation').getByRole('button', { name: /홈/ }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}px`);
    await page.screenshot({ path: `test-results/home-${width}.png` });
  }
  await page.goto(`${server.resolvedUrls.local[0]}tests/ui.html?hooks`);
  await page.getByRole('button', { name: 'Account B' }).click();
  await page.waitForFunction(() => {
    const state = JSON.parse(document.querySelector('[data-testid="hook-state"]').textContent);
    return !state.loading && state.records[0] === 'B';
  });
  // Explicitly simulate a late response from the old account.
  await page.waitForTimeout(500);
  const hooks = JSON.parse(await page.getByTestId('hook-state').textContent());
  assert.deepEqual(hooks.records, ['B']);
  assert.deepEqual(hooks.favorites, ['B']);
  assert.equal(hooks.error, '');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="hook-state"]').textContent).records.length === 0);
  assert.deepEqual(JSON.parse(await page.getByTestId('hook-state').textContent()).favorites, []);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: periods, income details, Korean focus, line totals, retry ID, salary, nav, 4 viewport sizes. Production network blocked.');
} catch (error) {
  await page.screenshot({ path: 'test-results/failure.png' });
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}
