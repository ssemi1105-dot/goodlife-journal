import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

process.env.TZ = 'Asia/Seoul';
let server, utils, storage, weather, exports;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  utils = await server.ssrLoadModule('/src/utils/recordUtils.js');
  storage = await server.ssrLoadModule('/src/services/recordStorage.js');
  weather = await server.ssrLoadModule('/src/services/weatherClient.js');
  exports = await server.ssrLoadModule('/src/components/DataExportPanel.jsx');
});
after(async () => { await server?.close(); });

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
