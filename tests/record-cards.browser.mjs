import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5185, strictPort: false }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
  // Card tests must not read or modify production records or use paid APIs.
  return route.fulfill({ json: [] });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const card = (id) => page.locator(`[data-record-id="${id}"] .record-card`);
await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${server.resolvedUrls.local[0]}tests/ui.html?cards`);
  await card('video').waitFor();
  assert.equal(await page.locator('.is-compact-record').count(), 7);
  assert.equal(await card('dining').locator('.compact-record-content').count(), 0);
  assert.equal(await card('shopping').locator('.shopping-item-preview li').count(), 2);
  assert.equal(await card('long').locator('.compact-record-menu-name').textContent(), '김치찌개 외 1개');
  assert.equal(await card('long').locator('.compact-record-menu-name').getAttribute('title'), '김치찌개, 계란말이');
  assert.match(await card('long').locator('.compact-record-weather').textContent(), /최고 0°C/);
  assert.equal(await card('legacy').locator('.compact-record-menu-name').textContent(), '비빔밥');
  assert.equal(await card('legacy').locator('.compact-record-amount').textContent(), '0원');
  assert.equal(await card('empty').locator('.compact-record-menu-name').count(), 0);
  assert.equal(await card('empty').locator('.compact-record-amount').count(), 0);
  assert.equal(await card('no-poster').locator('img').count(), 0);
  assert.equal(await card('no-poster').locator('.rating-preview').count(), 0);
  assert.equal(await card('video').locator('.rating-preview-star').count(), 5);
  assert.equal(await card('video').locator('.rating-preview-fill').last().evaluate((el) => el.style.width), '50%');
  assert.equal(await card('video').locator('.rating-preview button').count(), 0);
  assert.ok(await card('meal-photo').locator('img').evaluate((el) => el.complete && el.naturalWidth > 0));

  const layouts = [];
  for (const width of [320, 354, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const overlap = [];
      document.querySelectorAll('.compact-record-main, .compact-record-reaction, .compact-record-header').forEach((row) => {
        const rects = [...row.children].map((child) => ({ name: child.className, box: child.getBoundingClientRect() }));
        rects.forEach((a, index) => rects.slice(index + 1).forEach((b) => {
          if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1
            && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1) overlap.push([a.name, b.name]);
        }));
      });
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlap,
        amountsFit: [...document.querySelectorAll('.compact-record-amount')].every((el) => el.scrollWidth <= el.clientWidth + 1),
        heights: ['video', 'meal-photo', 'meal-plain'].map((id) => document.querySelector(`[data-record-id="${id}"] .record-card`).offsetHeight),
        textStaysInside: [...document.querySelectorAll('.compact-record-memo,.compact-record-amount')].every((el) => el.getBoundingClientRect().right <= el.closest('.record-card').getBoundingClientRect().right - 4),
      };
    });
    assert.equal(metrics.overflow, false, `overflow at ${width}px`);
    assert.deepEqual(metrics.overlap, [], `overlap at ${width}px`);
    assert.ok(metrics.amountsFit, `amount clipped at ${width}px`);
    assert.ok(metrics.textStaysInside, `content escapes card at ${width}px`);
    assert.deepEqual(metrics.heights, [96, 92, 74], `card heights at ${width}px`);
    layouts.push({ width, ...metrics });
    await page.screenshot({ path: `test-results/record-cards-${width}.png` });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await card('meal-photo').getByRole('button', { name: '기록 메뉴' }).tap();
  assert.equal(await page.getByRole('menu').count(), 1);
  assert.equal(await page.locator('.detail-modal').count(), 0);
  const menuBox = await page.getByRole('menu').boundingBox();
  assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 390 && menuBox.y + menuBox.height <= 844);
  await page.getByRole('heading', { name: '기록 카드 테스트' }).tap();
  assert.equal(await page.getByRole('menu').count(), 0);
  await card('meal-photo').getByRole('button', { name: '기록 메뉴' }).tap();
  await page.getByRole('menuitem', { name: '수정', exact: true }).tap();
  assert.equal(await page.getByTestId('card-action').textContent(), 'edit:meal-photo');
  assert.equal(await page.getByRole('menu').count(), 0);
  await card('meal-plain').getByRole('button', { name: '기록 메뉴' }).tap();
  await page.getByRole('menuitem', { name: '삭제', exact: true }).tap();
  assert.equal(await page.getByTestId('card-action').textContent(), 'delete:meal-plain');
  assert.equal(await page.getByRole('menu').count(), 0);
  await card('video').getByRole('button', { name: '기록 메뉴' }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('menu').count(), 1);
  assert.equal(await page.locator('.detail-modal').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);

  await card('long').locator('.compact-record-menu-name').tap();
  await page.locator('.detail-modal').waitFor();
  assert.equal(await page.locator('.detail-line-items > div').count(), 2);
  assert.match(await page.locator('.detail-fields').textContent(), /김치찌개/);
  assert.match(await page.locator('.detail-fields').textContent(), /계란말이/);
  assert.match(await page.locator('.detail-fields').textContent(), /상세 화면에서는 전체 내용을 볼 수 있어야 합니다/);
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await card('meal-photo').getByRole('img', { name: /평점 4.0/ }).tap();
  await page.locator('.detail-modal').waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, layouts, checks: 'Real menu/memo, half stars, legacy/missing data, portal edit/delete, outside dismiss, keyboard, read-only rating click, full detail, production network blocked.' }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'test-results/record-cards-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
