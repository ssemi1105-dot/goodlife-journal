import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.TZ = 'Asia/Seoul';
let server, utils, storage, weather, exports, RecordCard, kpassComponents, presentation, summaries, DetailFields, LeaveGrid, categories;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  utils = await server.ssrLoadModule('/src/utils/recordUtils.js');
  storage = await server.ssrLoadModule('/src/services/recordStorage.js');
  weather = await server.ssrLoadModule('/src/services/weatherClient.js');
  exports = await server.ssrLoadModule('/src/components/DataExportPanel.jsx');
  RecordCard = (await server.ssrLoadModule('/src/components/RecordCard.jsx')).default;
  kpassComponents = await server.ssrLoadModule('/src/components/KpassRecords.jsx');
  presentation = await server.ssrLoadModule('/src/utils/recordPresentation.js');
  summaries = await server.ssrLoadModule('/src/components/CategoryRecordSummary.jsx');
  DetailFields = (await server.ssrLoadModule('/src/components/RecordDetailFields.jsx')).default;
  LeaveGrid = (await server.ssrLoadModule('/src/components/AnnualLeaveGrid.jsx')).default;
  categories = (await server.ssrLoadModule('/src/data/categoryDefinitions.js')).CATEGORIES;
});
after(async () => { await server?.close(); });

test('K-pass groups split charges/refunds by assigned month and sorts real transaction dates without mutation', () => {
  const records = [
    { id: 'charge', category_id: 'kpass', occurred_on: '2026-10-01', data: { yearMonth: '2026-10', date: '2026-10-02', chargeAmount: '50,000' } },
    { id: 'refund', category_id: 'kpass', occurred_on: '2026-10-01', data: { yearMonth: '2026-10', date: '2026-11-05', refundAmount: '20000' } },
    { id: 'charge2', category_id: 'kpass', data: { yearMonth: '2026-10', date: '2026-10-15', chargeAmount: 50000 } },
    { id: 'lastYear', category_id: 'kpass', data: { yearMonth: '2025-10', chargeAmount: 30000, refundAmount: 3000 } },
    { id: 'fallback', category_id: 'kpass', occurred_on: '2026-09-01', data: { chargeAmount: 10000 } },
    { id: 'missing', category_id: 'kpass', data: { yearMonth: '2026-13', refundAmount: 1000 } },
    { id: 'other', category_id: 'salary', data: { yearMonth: '2026-10', chargeAmount: 999999 } },
  ];
  const original = structuredClone(records);
  const groups = utils.groupKpassByMonth(records);
  assert.deepEqual(groups.map((group) => group.month), ['2026-10', '2026-09', '2025-10', 'unknown']);
  assert.deepEqual(groups[0].records.map((record) => record.id), ['refund', 'charge2', 'charge']);
  assert.equal(groups[0].chargeAmount, 100000);
  assert.equal(groups[0].refundAmount, 20000);
  assert.equal(groups[0].refundRate, '20.0');
  assert.deepEqual(utils.summarizeKpass(records), { chargeAmount: 140000, refundAmount: 24000, refundRate: '17.1' });
  assert.deepEqual(records, original);
  assert.deepEqual(utils.summarizeKpass([]), { chargeAmount: 0, refundAmount: 0, refundRate: '0.0' });
  assert.equal(utils.summarizeKpass([records[1]]).refundRate, '0.0');
});

test('K-pass preserves entered dates on new saves and does not invent a date for legacy month-only records', () => {
  const data = { yearMonth: '2026-09', date: '2026-10-05', chargeAmount: 50000, refundAmount: 10000 };
  const derived = utils.deriveRecordColumns('kpass', data);
  assert.equal(derived.occurred_on, '2026-10-05');
  assert.equal(derived.amount, 40000, 'existing expense calculation is unchanged');
  assert.equal(utils.getKpassRecordDate({ occurred_on: '2026-09-01', data }), '2026-10-05');
  assert.equal(utils.getKpassRecordDate({ occurred_on: '2026-09-01', data: { yearMonth: '2026-09' } }), '');
  assert.equal(utils.getKpassRecordDate({ data: { date: '2026-09-01' } }), '2026-09-01');
  assert.equal(utils.getKpassRecordDate({ occurred_on: '2026-09-15' }), '2026-09-15');
  assert.equal(utils.deriveRecordColumns('kpass', { yearMonth: '2026-09' }).occurred_on, '2026-09-01');
});

test('K-pass presents only charge/refund cards and a three-value summary, with no net cost UI', () => {
  const records = [{ id: 'a', category_id: 'kpass', amount: 40000, data: { yearMonth: '2026-10', chargeAmount: 50000, refundAmount: 10000 } }];
  const summary = renderToStaticMarkup(createElement(kpassComponents.KpassSummary, { records }));
  for (const text of ['총 충전비용', '총 환급비용', '환급률', '20.0%']) assert.ok(summary.includes(text));
  const list = renderToStaticMarkup(createElement(kpassComponents.KpassMonthlyList, { records, onOpenMonth() {} }));
  assert.match(list, /2026년 10월/);
  assert.match(list, /50,000원/);
  assert.match(list, /10,000원/);
  assert.ok(!list.includes('환급률'));
  const card = renderToStaticMarkup(createElement(RecordCard, { record: records[0] }));
  assert.ok(!`${summary}${list}${card}`.includes('순비용'));
});

test('menu previews use real names, support legacy records, and never mutate stored data', () => {
  const data = Object.freeze({ menuItems: Object.freeze([null, { name: ' ' }, { name: ' 김치찌개 ', amount: 9000 }, { name: '계란말이' }]) });
  assert.deepEqual(utils.getMenuPreview(data), { label: '김치찌개 외 1개', fullText: '김치찌개, 계란말이' });
  assert.equal(data.menuItems[2].name, ' 김치찌개 ');
  assert.equal(utils.getMenuPreview({ menu: '비빔밥' }).label, '비빔밥');
  assert.equal(utils.getMenuPreview({ menuItems: [], items: [{ name: '된장찌개' }] }).label, '된장찌개');
  assert.deepEqual(utils.getMenuPreview({ menuItems: [null, { amount: 9000 }] }), { label: '', fullText: '' });
});

test('compact company-meal cards keep full menu and memo text and the authoritative total', () => {
  const record = { category_id: 'workMeal', occurred_on: '2026-10-02', rating: 4.5, amount: 0,
    data: { restaurant: '마당집', menuItems: [{ name: '김치찌개', amount: 9000 }, { name: '계란말이', amount: 3000 }], memo: '실제 저장된 메모' } };
  const html = renderToStaticMarkup(createElement(RecordCard, { record }));
  assert.match(html, /compact-record-menu-name/);
  assert.match(html, /김치찌개 외 1개/);
  assert.match(html, /title="김치찌개, 계란말이"/);
  assert.match(html, /실제 저장된 메모/);
  assert.match(html, /compact-record-amount">0원/);
  assert.equal((html.match(/class="rating-preview-star"/g) || []).length, 5);
  assert.equal((html.match(/width:50%/g) || []).length, 1);
  assert.equal((html.match(/<button /g) || []).length, 1, 'stars are read-only; only the action menu is a button');
});

test('compact video cards preserve flat TMDB titles, period, status, genres and no-poster compatibility', () => {
  const record = { category_id: 'video', rating: null, data: { tmdbTitle: '트로이', startDate: '2026-09-01', endDate: '2026-09-13',
    watchStatus: '시청완료', episodeStart: 1, episodeEnd: 16, detailGenres: ['역사'], memo: '감독판' } };
  const html = renderToStaticMarkup(createElement(RecordCard, { record }));
  for (const text of ['트로이', '시청완료', '1~16화', '감독판', '역사', '2026.09.01', '2026.09.13']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('has-photo'));
  assert.ok(!html.includes('rating-preview'));
  assert.ok(!html.includes('compact-record-menu-name'));
});

test('every category uses the width-safe common shell with category-specific content', () => {
  for (const { id: category_id } of categories) {
    const html = renderToStaticMarkup(createElement(RecordCard, { record: { category_id, data: {}, amount: 1000 } }));
    assert.match(html, /is-presented-record/);
    assert.match(html, /compact-record-header/);
    assert.equal((html.match(/aria-label="기록 메뉴"/g) || []).length, 1);
    if (['video', 'workMeal', 'dining', 'delivery'].includes(category_id)) assert.match(html, /is-compact-record/);
    else assert.match(html, /record-preview-body/);
  }
});

test('display selectors preserve zero values, original records, legacy items and all body measurements', () => {
  const hospital = { category_id: 'hospital', amount: 50000, data: { hospital: '병원', netMedicalCost: 0, medicalCost: 50000, insuranceRefund: 50000 } };
  assert.equal(presentation.presentRecord(hospital).primary.value, '0원');
  const shopping = { category_id: 'shopping', amount: 0, data: { storeName: '구매처', productName: '상품', productPrice: 0 } };
  const original = structuredClone(shopping);
  const view = presentation.getDisplayData(shopping);
  assert.equal(view.productItems[0].amount, 0);
  assert.equal(presentation.presentRecord(shopping).title, '구매처');
  assert.deepEqual(shopping, original);
  const body = presentation.presentRecord({ category_id: 'exercise', data: { bodyWeight: 65.5, armCm: 30, waistCm: 75.5, thighCm: 50, calfCm: 34 } });
  assert.equal(body.primary.value, '65.5kg');
  assert.equal(body.metrics.length, 4);
  assert.equal(presentation.presentRecord({ category_id: 'subscription', data: { active: false } }).status, '비활성');
  assert.equal(presentation.presentRecord({ category_id: 'subscription', data: { active: 'false' } }).status, '비활성');
  assert.ok(presentation.presentRecord({ category_id: 'fishing', data: { weight: '1.2kg' } }).details.includes('1.2kg'));
  assert.ok(presentation.presentRecord({ category_id: 'fishing', data: { weight: '1.2' } }).details.includes('1.2kg'));
  assert.equal(presentation.numberText(0.0001), '0.0001');
  assert.deepEqual(presentation.getDisplayData({ category_id: 'dining', data: { menuItems: ['국밥', '전'] } }).menuItems, [{ name: '국밥' }, { name: '전' }]);
});

test('category summaries show income, recorded savings, and counts without changing finance calculations', () => {
  const records = [
    { category_id: 'salary', occurred_on: '2026-10-05', amount: 0, income_amount: 3100000, data: {} },
    { category_id: 'savings', occurred_on: '2026-10-06', amount: 0, data: { monthlyAmount: 500000 } },
    { category_id: 'video', occurred_on: '2026-09-01', data: {} },
  ];
  const date = new Date('2026-10-10T12:00:00+09:00');
  assert.equal(summaries.categorySummaryValues('salary', records, date)[1].value, '3,100,000원');
  assert.equal(summaries.categorySummaryValues('savings', records, date)[0].value, '500,000원');
  assert.deepEqual(summaries.categorySummaryValues('video', records, date).map(item => item.value), ['1건', '0건']);
  assert.equal(utils.getRecordFinanceValue(records[1]).expense, 0);
});

test('detail fields format currency and disabled state, keep name-only items and foreign units', () => {
  const render = (record) => renderToStaticMarkup(createElement(DetailFields, { record }));
  assert.match(render({ category_id: 'subscription', data: { active: false, billingDay: 15 } }), /비활성/);
  assert.match(render({ category_id: 'subscription', data: { billingDay: 15 } }), /매월 15일/);
  assert.match(render({ category_id: 'fishing', data: { amount: 90000, catchCount: 8 } }), /90,000원/);
  assert.match(render({ category_id: 'hospital', data: { medicalCost: 50000, insuranceRefund: 30000 } }), /50,000원/);
  const local = render({ category_id: 'overseasTravel', data: { currency: 'JPY', localExpenses: [{ name: '라멘', amount: 1200, rating: 4.5 }] } });
  assert.match(local, /JPY/);
  assert.ok(!local.includes('1,200원'));
  assert.match(local, /평점 4.5/);
  const legacy = render({ category_id: 'shopping', data: { items: [{ name: '이름만', price: 0 }] } });
  assert.match(legacy, /이름만/);
  assert.match(legacy, /0원/);
});

test('annual leave separates grants, keeps each use and decimal days, and orders years and dates', () => {
  const records = [
    { id: 'grant', category_id: 'annual_leave', data: { recordType: 'grant', year: 2026, grantDays: 10.5 } },
    { id: 'half', category_id: 'annual_leave', data: { recordType: 'use', date: '2026-10-01', days: 0.5 } },
    { id: 'full', category_id: 'annual_leave', data: { recordType: 'use', date: '2026-10-03', days: 1 } },
    { id: 'old', category_id: 'annual_leave', data: { recordType: 'use', date: '2025-10-03', days: 1 } },
  ];
  const before = structuredClone(records);
  const groups = presentation.groupAnnualLeave(records);
  assert.deepEqual(groups.map(group => group.year), ['2026', '2025']);
  assert.deepEqual(groups[0].uses.map(record => record.id), ['full', 'half']);
  const html = renderToStaticMarkup(createElement(LeaveGrid, { records }));
  assert.equal((html.match(/class="leave-day-tile"/g) || []).length, 3);
  assert.match(html, /연차 0.5일 사용/);
  assert.match(html, /10.5일/);
  assert.deepEqual(records, before);
  assert.equal(utils.calcAnnualLeave(records, 2026).remainDays, 9);
});

test('amount-only edits override hidden stale unit prices in every line-item category', () => {
  for (const [category, field] of [['workMeal', 'menuItems'], ['delivery', 'menuItems'], ['vehicle', 'expenseItems'], ['overseasTravel', 'localExpenses']]) {
    const normalized = utils.normalizeLineItem({ name: '김치찌개', unitPrice: '9000', amount: '12000', quantity: 1 });
    assert.equal(utils.calcLineItemAmount(normalized), 12000, category);
    const data = storage.cleanRecordData(category, { [field]: [normalized] });
    assert.equal(utils.toNumber(data[field]), 12000, category);
  }
  assert.equal(utils.deriveRecordColumns('workMeal', { menuItems: [{ name: '김치찌개', unitPrice: 9000, amount: 12000 }] }).amount, 12000);
});

test('quantity, zero quantity, empty price, and discounted legacy totals', () => {
  assert.equal(utils.calcLineItemAmount({ pricingMode: 'unit', unitPrice: 9000, quantity: 2, discountAmount: 1000 }), 17000);
  assert.equal(utils.calcLineItemAmount({ pricingMode: 'unit', unitPrice: 9000, quantity: 0 }), 0);
  assert.equal(utils.calcLineItemAmount({ pricingMode: 'unit', unitPrice: '', quantity: 2, amount: 9000 }), 0);
  assert.equal(utils.calcLineItemAmount(utils.normalizeLineItem({ amount: 17000, quantity: 2, discountAmount: 1000 }, true)), 17000);
});

test('payload trims only at save, drops empty rows and client IDs, preserves name-only items', () => {
  const data = storage.cleanRecordData('shopping', { productItems: [
    { name: '  양말  ', unitPrice: '', quantity: 1, _clientId: 'stable' },
    { name: '', unitPrice: '', quantity: 1, _clientId: 'empty' },
  ] });
  assert.equal(data.productItems.length, 1);
  assert.equal(data.productItems[0].name, '양말');
  assert.equal(data.productItems[0].amount, 0);
  assert.ok(!('_clientId' in data.productItems[0]));
});

test('delivery menu plus fee is recalculated, not stale total', () => {
  const data = storage.cleanRecordData('delivery', { menuItems: [{ name: '치킨', amount: 20000, unitPrice: 9000 }], deliveryFee: '3000', totalAmount: '12000' });
  assert.equal(data.totalAmount, 23000);
  assert.equal(utils.deriveRecordColumns('delivery', data).amount, 23000);
});

test('salary recomputes every digit and respects explicit after-tax amounts and bonus', () => {
  for (const grossAmount of ['3', '30', '300', '3000', '3000000']) {
    assert.equal(utils.getSalaryNet({ salaryBasis: '세전', grossAmount, tax: 0, netAmount: 3 }), Number(grossAmount));
  }
  assert.equal(utils.deriveRecordColumns('salary', { salaryBasis: '세전', grossAmount: 3000000, tax: 300000, bonus: true, bonusAmount: 100000 }).income_amount, 2800000);
  assert.equal(utils.getSalaryNet({ salaryBasis: '세후', grossAmount: 3000000, tax: 300000, netAmount: 2500000 }), 2500000);
});

test('local morning and period boundaries never slip into the previous UTC date', () => {
  const date = new Date('2026-10-01T00:30:00+09:00');
  assert.equal(utils.todayIso(date), '2026-10-01');
  assert.deepEqual(utils.getPeriodRange('month', date), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(utils.getPeriodRange('quarter', date), { start: '2026-10-01', end: '2026-12-31' });
  assert.deepEqual(utils.getPeriodRange('year', date), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(utils.getPeriodRange('week', date), { start: '2026-09-28', end: '2026-10-04' });
});

test('nested menu/product names are searchable without amount filters hiding zero amounts', () => {
  const records = [{ id: 'x', category_id: 'shopping', amount: 0, data: { productItems: [{ name: '김치찌개' }] } }];
  assert.equal(utils.filterRecords(records, { query: '김치찌개' }).length, 1);
  assert.equal(utils.filterRecords(records, { query: '김치찌개'.normalize('NFD') }).length, 1);
});

const buy = { id: 'buy', category_id: 'investment', occurred_on: '2026-05-02', created_at: '1', data: { recordType: 'buy', symbol: '000660', quantity: 10, avgBuyPrice: 100 } };
const sell = { id: 'sell', category_id: 'investment', occurred_on: '2026-05-03', created_at: '2', data: { recordType: 'sell', symbol: '000660', soldQuantity: 4, sellPrice: 110 } };
test('valid sales reduce holdings and use chronological validation', () => {
  assert.doesNotThrow(() => utils.validateInvestmentLedger([sell, buy], new Set(['KR:000660'])));
  assert.equal(utils.buildInvestmentLedger([sell, buy]).positions[0].quantity, 6);
});
test('future buys cannot justify an earlier sale; changing/deleting a buy cannot orphan sales', () => {
  assert.throws(() => utils.validateInvestmentLedger([buy, { ...sell, occurred_on: '2026-05-01' }]), /당시 보유수량/);
  assert.throws(() => utils.validateInvestmentLedger([sell]), /당시 보유수량/);
  assert.throws(() => utils.validateInvestmentLedger([{ ...buy, data: { ...buy.data, quantity: 2 } }, sell]), /당시 보유수량/);
  assert.doesNotThrow(() => utils.validateInvestmentLedger([sell], ['KR:OTHER']));
});

test('exports honor excluded categories, retain raw amounts, and neutralize spreadsheet formulas', () => {
  const record = { category_id: 'workMeal', amount: 9000, income_amount: 0, data: { memo: 'test', photos: [{ path: 'u/r/p', signedUrl: 'temporary' }] } };
  assert.deepEqual(exports.exportFinance(record), { expense: 0, income: 0 });
  assert.equal(exports.exportFinance(record, { finance_modes: { workMeal: 'expense' } }).expense, 9000);
  const copy = exports.toExportRecord(record);
  assert.equal(copy.amount, 9000);
  assert.ok(!('signedUrl' in copy.data.photos[0]));
  assert.ok(exports.escapeCsv(' \t=HYPERLINK("x")').startsWith('"\''));
});

test('missing weather code stays missing, zero remains clear weather', async () => {
  assert.equal(weather.getWeatherLabel(null), '');
  assert.equal(weather.getWeatherLabel(0), '맑음');
  const previous = globalThis.fetch;
  try {
    let requested;
    globalThis.fetch = async (url) => { requested = url; return { ok: true, json: async () => ({ daily: { weathercode: [null] } }) }; };
    assert.equal(await weather.fetchWeatherForDate({ date: utils.todayIso() }), null);
    assert.ok(requested.includes('latitude=37.6'));
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ daily: { weathercode: [0], temperature_2m_max: [23] } }) });
    assert.equal((await weather.fetchWeatherForDate({ date: utils.todayIso() })).weatherCode, 0);
    await assert.rejects(weather.fetchWeatherForDate({ date: utils.todayIso(), latitude: '' }), /위도/);
  } finally { globalThis.fetch = previous; }
});

function fakeClient(initial = [], options = {}) {
  const rows = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  const events = [];
  let page = 0;
  return { rows, events, storage: { from: () => ({
    upload: async (path) => { events.push(['upload', path]); return { error: options.uploadError || null }; },
    remove: async (paths) => { events.push(['removePhotos', paths]); return { error: null }; },
  }) }, from: () => {
    let operation = 'select', payload, filters = [], range;
    const builder = {
      select: () => builder,
      eq: (key, value) => { filters.push([key, value]); return builder; },
      lte: () => builder,
      order: () => builder,
      range: (start, end) => { range = [start, end]; return builder; },
      update: (data) => { operation = 'update'; payload = data; return builder; },
      upsert: (data) => { operation = 'upsert'; payload = data; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      single: () => execute(true), maybeSingle: () => execute(true),
      then: (resolve, reject) => execute(false).then(resolve, reject),
    };
    async function execute(single) {
      const matches = [...rows.values()].filter((row) => filters.every(([key, value]) => row[key] === value));
      if (operation === 'select') {
        if (range) {
          page += 1;
          events.push(['page', range, filters]);
          if (options.pageError === page) return { error: new Error('page failed') };
          return { data: matches.slice(range[0], range[1] + 1), count: matches.length + (options.changedCount && page > 1 ? 1 : 0), error: null };
        }
        return { data: single ? matches[0] || null : matches, error: null };
      }
      events.push([operation, payload, filters]);
      if (options.writeError) return { error: new Error('write failed') };
      if (operation === 'delete') { matches.forEach((row) => rows.delete(row.id)); return { data: matches.map(({ id }) => ({ id })), error: null }; }
      const record = operation === 'update' ? matches[0] && { ...matches[0], ...payload } : payload;
      if (!record) return { error: { code: 'PGRST116' } };
      rows.set(record.id, record);
      return { data: record, error: null };
    }
    return builder;
  } };
}

test('pagination loads 1,205 own records in verified batches and excludes other accounts', async () => {
  const own = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), user_id: 'u', occurred_on: '2026-10-01' }));
  const client = fakeClient([...own, { id: 'foreign', user_id: 'other' }]);
  assert.equal((await storage.fetchAllRecords(client, 'u')).length, 1205);
  assert.equal(client.events.filter(([name]) => name === 'page').length, 3);
  await assert.rejects(storage.fetchAllRecords(client, null), /로그인/);
});
test('pagination never exports a partial dataset after failure or count changes', async () => {
  const own = Array.from({ length: 601 }, (_, i) => ({ id: String(i), user_id: 'u' }));
  await assert.rejects(storage.fetchAllRecords(fakeClient(own, { pageError: 2 }), 'u'), /page failed/);
  await assert.rejects(storage.fetchAllRecords(fakeClient(own, { changedCount: true }), 'u'), /변경/);
});

const existing = { id: 'r', user_id: 'u', category_id: 'shopping', updated_at: 'old', data: { photos: [{ path: 'u/r/old.jpg' }] } };
const photo = { file: new File(['image'], 'image.jpg', { type: 'image/jpeg' }) };
const params = { userId: 'u', recordId: 'r', categoryId: 'shopping', formData: { store: '매장', productItems: [{ name: '양말', unitPrice: 1000, quantity: 2 }], photos: [photo] } };
test('photo upload failure does not create a record or delete existing photos', async () => {
  const client = fakeClient([existing], { uploadError: new Error('upload failed') });
  await assert.rejects(storage.persistRecord(client, { ...params, existingRecord: existing }), /upload failed/);
  assert.ok(!client.events.some(([name]) => ['upsert', 'update', 'removePhotos'].includes(name)));
});
test('save uploads first, then commits DB, then removes replaced photos', async () => {
  const client = fakeClient([existing]);
  const saved = await storage.persistRecord(client, { ...params, existingRecord: existing });
  assert.deepEqual(client.events.map(([name]) => name), ['upload', 'update', 'removePhotos']);
  assert.equal(saved.amount, 2000);
});
test('retries reuse record and photo IDs, never duplicate records', async () => {
  const client = fakeClient();
  await storage.persistRecord(client, params);
  await storage.persistRecord(client, params);
  assert.equal(client.rows.size, 1);
  const uploads = client.events.filter(([name]) => name === 'upload');
  assert.equal(uploads[0][1], uploads[1][1]);
});
test('DB failure preserves old photos and retries can still use uploads', async () => {
  const client = fakeClient([existing], { writeError: true });
  await assert.rejects(storage.persistRecord(client, { ...params, existingRecord: existing }), /write failed/);
  assert.ok(!client.events.some(([name]) => name === 'removePhotos'));
});
test('record deletion precedes storage cleanup; failed DB delete never deletes photos', async () => {
  const failed = fakeClient([existing], { writeError: true });
  await assert.rejects(storage.removeRecord(failed, 'u', existing), /write failed/);
  assert.deepEqual(failed.events.map(([name]) => name), ['delete']);
  const client = fakeClient([existing]);
  await storage.removeRecord(client, 'u', existing);
  assert.deepEqual(client.events.map(([name]) => name), ['delete', 'removePhotos']);
  await assert.rejects(storage.removeRecord(client, 'other', existing), /소유자/);
});
test('stale record edits fail rather than overwrite a newer revision', async () => {
  const client = fakeClient([{ ...existing, updated_at: 'newer' }]);
  await assert.rejects(storage.persistRecord(client, { ...params, existingRecord: existing }), /다른 화면/);
  assert.equal(client.rows.get('r').updated_at, 'newer');
});

test('security migration explicitly closes raw cross-user reads and direct friend acceptance', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610010001_harden_sharing_permissions.sql', import.meta.url), 'utf8');
  assert.match(sql, /as restrictive/);
  assert.match(sql, /revoke insert, update on public.friendships from anon, authenticated/);
  assert.match(sql, /drop policy if exists "records_select_owner_or_shared"/);
  assert.match(sql, /revoke insert, update on public.record_shares/);
});
