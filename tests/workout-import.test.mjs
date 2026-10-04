import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { activity, chartActivity, tcx, fakeDatabase, NS } from './helpers/tcxFixture.mjs';

let server, parser, summary, storage, records, utils, categories, chartUtils, months;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  parser = await server.ssrLoadModule('/src/utils/tcxParser.js');
  summary = await server.ssrLoadModule('/src/utils/workoutSummary.js');
  storage = await server.ssrLoadModule('/src/services/workoutImportStorage.js');
  records = await server.ssrLoadModule('/src/services/recordStorage.js');
  utils = await server.ssrLoadModule('/src/utils/recordUtils.js');
  categories = await server.ssrLoadModule('/src/data/categoryDefinitions.js');
  chartUtils = await server.ssrLoadModule('/src/utils/workoutChartData.js');
  months = await server.ssrLoadModule('/src/utils/workoutMonths.js');
});
after(async () => { await server?.close(); });

test('monthly workouts keep years separate, total only known metrics and preserve every original record', () => {
  const entries = [
    { id: 'a', category_id: 'workout', occurred_on: '2026-10-04', data: { date: '2026-09-30', distanceMeters: 7006, durationSeconds: 5354, caloriesKcal: 442 } },
    { id: 'b', category_id: 'workout', data: { date: '2026-10-01', distanceMeters: '1000', durationSeconds: '600', caloriesKcal: '50' } },
    { id: 'c', category_id: 'workout', data: { startedAt: '2026-09-30T23:00:00Z', distanceMeters: 0, durationSeconds: 0, caloriesKcal: 0 } },
    { id: 'old', category_id: 'workout', data: { date: '2025-10-01', distanceMeters: 1000 } },
    { id: 'unknown', category_id: 'workout', data: { date: '2026-02-30', durationSeconds: '' } },
    { id: 'other', category_id: 'exercise', data: { date: '2026-10-04', distanceMeters: 99999 } },
  ];
  const original = structuredClone(entries);
  const groups = months.groupWorkoutsByMonth(entries);
  assert.deepEqual(groups.map(group => group.month), ['2026-10', '2025-10', 'unknown']);
  assert.deepEqual(groups[0].records.map(record => record.id), ['a', 'c', 'b']);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].distanceMeters, 8006);
  assert.equal(groups[0].durationSeconds, 5954);
  assert.equal(groups[0].caloriesKcal, 492);
  assert.equal(groups[2].durationSeconds, null, 'missing measurements are not presented as zero');
  assert.equal(groups[1].durationSeconds, null);
  assert.equal(months.summarizeWorkouts([]).durationSeconds, 0);
  assert.equal(months.summarizeWorkouts([entries[0], entries[4]]).measured.durationSeconds, 1);
  assert.deepEqual(entries, original);
  assert.equal(months.formatWorkoutMonth('2026-10'), '2026년 10월');
  assert.equal(months.formatWorkoutMonth('unknown'), '날짜 미지정');
});
async function parse(xml, chunkSize = 137) {
  const reader = parser.createTcxSummaryParser();
  for (let i = 0; i < xml.length; i += chunkSize) reader.write(xml.slice(i, i + chunkSize));
  return reader.finish();
}

test('TCX streaming summary keeps dates, lap totals, HR and derived metrics only', async () => {
  const [data] = await parse(tcx(activity()));
  assert.equal(data.date, '2026-10-04');
  assert.equal(data.activityType, '걷기');
  assert.equal(summary.workoutTimestamp(data.startedAt), '2026-10-04 16:14:21');
  assert.equal(data.durationSeconds, 5354);
  assert.equal(data.distanceMeters, 7006);
  assert.equal(data.caloriesKcal, 442);
  assert.equal(data.averageHeartRate, 93);
  assert.equal(data.maxHeartRate, 112);
  assert.equal(data.averageSpeedKmh, 4.711);
  assert.equal(data.averagePaceSeconds, 764.2);
  assert.match(data.importKey, /^[a-f0-9]{64}$/);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 1024);
  assert.ok(!/latitude|longitude|Trackpoint|Position|\.tcx|<Activity/.test(JSON.stringify(data)));
  assert.equal(summary.workoutDuration(5354), '1시간 29분 14초');
  assert.equal(summary.workoutPace(data.averagePaceSeconds), '12분 44초/km');
});

test('Korean calendar date is independent of browser timezone; multiple activities supported', async () => {
  const data = await parse(tcx(activity({ start: '2026-10-04T23:30:00Z' }), activity({ start: '2026-10-05T12:00:00+09:00', sport: 'Running' })));
  assert.equal(data[0].date, '2026-10-05');
  assert.equal(data[1].date, '2026-10-05');
  assert.notEqual(data[0].importKey, data[1].importKey);
});

test('multiple laps sum totals, weight lap HR, ignore unrelated extension values', async () => {
  const xml = `<TrainingCenterDatabase xmlns="${NS}"><Activities><Activity Sport="Running"><Id>2026-10-04T10:00:00Z</Id>
    <Lap><TotalTimeSeconds>100</TotalTimeSeconds><DistanceMeters>200</DistanceMeters><Calories>10</Calories><AverageHeartRateBpm><Value>100</Value></AverageHeartRateBpm></Lap>
    <Lap><TotalTimeSeconds>200</TotalTimeSeconds><DistanceMeters>400</DistanceMeters><Calories>20</Calories><AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm></Lap>
    <Extensions xmlns="urn:untrusted"><Calories>999999</Calories></Extensions>
    </Activity></Activities></TrainingCenterDatabase>`;
  const [data] = await parse(xml);
  assert.equal(data.durationSeconds, 300);
  assert.equal(data.distanceMeters, 600);
  assert.equal(data.caloriesKcal, 30);
  assert.equal(data.averageHeartRate, 120);
  assert.equal(data.maxHeartRate, null);
  assert.equal(data.activityType, '달리기');
});

test('namespace prefixes and missing metrics preserve nulls rather than invented zeros', async () => {
  let xml = tcx(activity({ calories: null, distance: null, hr: null, maxHr: null }));
  xml = xml.replaceAll(/<(\/?)([A-Z][A-Za-z]*)/g, '<$1t:$2').replace(`xmlns="${NS}"`, `xmlns:t="${NS}"`);
  const [data] = await parse(xml);
  assert.equal(data.caloriesKcal, null);
  assert.equal(data.distanceMeters, null);
  assert.equal(data.averageHeartRate, null);
  assert.equal(data.averageSpeedKmh, null);
  assert.equal(data.averagePaceSeconds, null);
});

test('malformed XML, DTD/entities, absent activities, invalid dates and excessive activities are rejected', async () => {
  for (const xml of [
    tcx(activity()).slice(0, -8),
    tcx(activity()).replace('<TrainingCenterDatabase', '<!DOCTYPE root [<!ENTITY secret SYSTEM "file:///secret">]><TrainingCenterDatabase'),
    tcx(), '<html>not TCX</html>', tcx(activity({ start: 'bad-date' })),
    tcx(...Array.from({ length: 21 }, () => activity())),
  ]) await assert.rejects(parse(xml));
  assert.throws(() => summary.cleanWorkoutData({ date: '2026-02-30' }));
});

test('save whitelist rejects raw data, GPS, images and unknown fields including later edits', async () => {
  const [data] = await parse(tcx(activity()));
  const extra = { ...data, rawXml: '<GPS/>', coordinates: [1, 2], samples: [{ heartRate: 90 }], file: { size: 1 }, photos: [{ path: 'raw.tcx' }], photoPath: 'raw.tcx' };
  assert.deepEqual(records.cleanRecordData('workout', extra), data);
  const client = fakeDatabase();
  const result = await records.persistRecord(client, { userId: 'a', recordId: 'manual', categoryId: 'workout', formData: extra });
  assert.deepEqual(result.data, data);
  assert.equal(result.occurred_on, '2026-10-04');
  assert.equal(result.amount, 0);
  assert.equal(categories.CATEGORY_MAP.exercise.label, '체중관리');
  assert.equal(categories.DEFAULT_FINANCE_MODES.workout, 'excluded');
});

test('import scopes records to owner, never uses Storage, deduplicates without overwriting edits', async () => {
  const client = fakeDatabase();
  const [data] = await parse(tcx(activity()));
  const first = await storage.persistWorkoutImport(client, 'user-a', data);
  assert.equal(first.duplicate, false);
  assert.equal(first.record.user_id, 'user-a');
  assert.equal(first.record.category_id, 'workout');
  assert.equal(first.record.visibility, 'private');
  client.rows.get(first.record.id).data.memo = 'kept edit';
  const duplicate = await storage.persistWorkoutImport(client, 'user-a', data);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.record.data.memo, 'kept edit');
  assert.equal(client.writes.length, 1);
  const other = await storage.persistWorkoutImport(client, 'user-b', data);
  assert.notEqual(other.record.id, first.record.id);
  assert.ok(client.reads.every(filters => filters.some(([key]) => key === 'user_id')));
  await assert.rejects(storage.persistWorkoutImport(client, null, data));
});

test('network failure, ambiguous committed response and duplicate race are retry-safe', async () => {
  const [data] = await parse(tcx(activity()));
  for (const failure of ['failNext', 'ambiguousNext', 'raceNext']) {
    const client = fakeDatabase(); client[failure] = true;
    if (failure === 'raceNext') assert.equal((await storage.persistWorkoutImport(client, 'a', data)).duplicate, true);
    else await assert.rejects(storage.persistWorkoutImport(client, 'a', data));
    await storage.persistWorkoutImport(client, 'a', data);
    assert.equal(client.rows.size, 1);
  }
});

test('the provided Zepp sample reduces to a bounded chart and summary without saving the file', { skip: !process.env.TCX_SAMPLE_PATH }, async () => {
  const xml = await readFile(process.env.TCX_SAMPLE_PATH, 'utf8');
  const [data] = await parse(xml, 65536);
  assert.deepEqual([data.date, data.durationSeconds, data.distanceMeters, data.caloriesKcal, data.averageHeartRate, data.maxHeartRate], ['2026-10-04', 5354, 7006, 442, 93, 112]);
  const bytes = Buffer.byteLength(JSON.stringify(data));
  assert.ok(bytes < 12000);
  assert.ok(data.chart.points.length <= 180);
  for (const column of [1, 2, 3]) assert.ok(data.chart.points.some(row => row[column] !== null));
  assert.ok(!/Latitude|Longitude|Trackpoint|Position|rawXml/.test(JSON.stringify(data)));
  console.log(`Local sample: ${Buffer.byteLength(xml)} bytes -> summary and chart ${bytes} bytes, ${data.chart.points.length} time buckets, ${data.chart.intervalSeconds}s interval. No database/network writes.`);
});

test('chart aggregation preserves zero speed and negative altitude, converts m/s and caps all saved matrices', async () => {
  const [data] = await parse(tcx(chartActivity()));
  const chart = data.chart;
  assert.ok(chart.points.length <= 180);
  assert.ok(chart.intervalSeconds > 1);
  assert.ok(chart.points.some(row => row[2] < 0));
  assert.ok(chart.points.every(row => row[3] === null || row[3] <= 7.2));
  const [short] = await parse(tcx(chartActivity({ count: 3, interval: 1 })));
  assert.equal(short.chart.points[0][3], 0);
  assert.equal(short.chart.points[1][3], 4.9);
  assert.equal(short.chart.points[0][2], -10);
  assert.deepEqual(records.cleanRecordData('workout', { ...data, chart: { ...chart, rawXml: '<GPS/>', coords: [1, 2] } }), data);
  assert.equal(chartUtils.cleanWorkoutChart({ ...chart, points: Array(181).fill(chart.points[0]) }), null);
  assert.equal(chartUtils.cleanWorkoutChart({ ...chart, points: [[0, 90, 20, { xml: 'raw' }]] }).points[0][3], null);
  assert.equal(chartUtils.cleanWorkoutChart({ ...chart, points: [[0, 90, 20, 1, 'extra']] }), null);
  assert.equal(chartUtils.cleanWorkoutChart({ ...chart, points: [[2, 90, 20, 1], [1, 90, 20, 1]] }), null);
  assert.equal(chartUtils.cleanWorkoutChart({ ...chart, durationSeconds: Infinity }), null);
});

test('missing sensors and long time gaps remain null; only trusted Speed extensions are parsed', async () => {
  const [missing] = await parse(tcx(chartActivity({ count: 2, interval: 1000, absent: true })));
  assert.ok(missing.chart.points.every(row => row[1] === null && row[2] === null));
  assert.ok(missing.chart.points.some(row => row.slice(1).every(value => value === null)));
  const untrusted = tcx(chartActivity({ count: 2 })).replaceAll('http://www.garmin.com/xmlschemas/ActivityExtension/v2', 'urn:untrusted');
  const [ignored] = await parse(untrusted);
  assert.ok(ignored.chart.points.every(row => row[3] === null));
});

test('long workouts keep a bounded numeric summary independent of raw sample count', () => {
  const reducer = chartUtils.createWorkoutChartReducer(0);
  for (let second = 0; second <= 86400; second += 1) reducer.add(second * 1000, 90, -1, 5);
  const chart = reducer.finish();
  assert.ok(chart.points.length <= 180);
  assert.ok(Buffer.byteLength(JSON.stringify(chart)) < 12000);
  assert.ok(chart.points.every(row => row[1] === 90 && row[2] === -1 && row[3] === 5));
});

test('same TCX supplements only missing charts, preserving manual edits and ownership', async () => {
  const client = fakeDatabase();
  const [data] = await parse(tcx(chartActivity()));
  const { chart, ...old } = data;
  const first = await storage.persistWorkoutImport(client, 'a', old);
  const original = client.rows.get(first.record.id);
  original.data = { ...original.data, activityName: 'edited name', memo: 'my memo', distanceMeters: 100 };
  original.title = 'edited name';
  const result = await storage.persistWorkoutImport(client, 'a', data);
  assert.equal(result.enriched, true);
  assert.equal(client.rows.size, 1);
  assert.equal(result.record.title, 'edited name');
  assert.equal(result.record.data.activityName, 'edited name');
  assert.equal(result.record.data.distanceMeters, 100);
  assert.equal(result.record.data.memo, 'my memo');
  assert.deepEqual(result.record.data.chart, chart);
  assert.equal((await storage.persistWorkoutImport(client, 'a', data)).duplicate, true);
  assert.equal(client.writes.length, 2);
  const saved = await records.persistRecord(client, { userId: 'a', recordId: first.record.id, categoryId: 'workout', existingRecord: result.record, formData: { ...result.record.data, memo: 'edit after chart' } });
  assert.deepEqual(saved.data.chart, chart, 'ordinary edits keep the bounded chart');
});

test('graph-only enrichment retries a concurrent edit and recovers after a lost commit response', async () => {
  const [data] = await parse(tcx(chartActivity()));
  const { chart, ...old } = data;
  const client = fakeDatabase();
  const first = await storage.persistWorkoutImport(client, 'a', old);
  client.beforeUpdate = rows => {
    rows.get(first.record.id).data.memo = 'concurrent edit';
    rows.get(first.record.id).updated_at = '2026-10-04T20:00:00.000Z';
  };
  const result = await storage.persistWorkoutImport(client, 'a', data);
  assert.equal(result.record.data.memo, 'concurrent edit');
  assert.deepEqual(result.record.data.chart, chart);
  delete client.rows.get(first.record.id).data.chart;
  client.ambiguousNext = true;
  await assert.rejects(storage.persistWorkoutImport(client, 'a', data));
  const retry = await storage.persistWorkoutImport(client, 'a', data);
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.record.data.chart, chart);
  assert.equal(client.rows.size, 1);
});
