export const NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
export function activity({ start = '2026-10-04T07:14:21Z', sport = 'Other', notes = '걷기', duration = 5354, distance = 7006, calories = 442, hr = 93, maxHr = 112 } = {}) {
  const tag = (name, value) => value === null ? '' : `<${name}>${value}</${name}>`;
  const end = Number.isFinite(Date.parse(start)) ? new Date(Date.parse(start) + (duration || 0) * 1000).toISOString() : start;
  return `<Activity Sport="${sport}"><Id>${start}</Id><Lap StartTime="${start}">
    ${tag('TotalTimeSeconds', duration)}${tag('DistanceMeters', distance)}${tag('Calories', calories)}
    ${hr === null ? '' : `<AverageHeartRateBpm><Value>${hr}</Value></AverageHeartRateBpm>`}
    ${maxHr === null ? '' : `<MaximumHeartRateBpm><Value>${maxHr}</Value></MaximumHeartRateBpm>`}
    <Track><Trackpoint><Time>${start}</Time><Position><LatitudeDegrees>37</LatitudeDegrees><LongitudeDegrees>127</LongitudeDegrees></Position></Trackpoint><Trackpoint><Time>${end}</Time></Trackpoint></Track>
    </Lap><Notes>${notes}</Notes></Activity>`;
}
export const tcx = (...activities) => `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="${NS}"><Activities>${activities.join('')}</Activities></TrainingCenterDatabase>`;

export function chartActivity({ start = '2026-10-04T07:14:21Z', count = 600, interval = 10, absent = false } = {}) {
  const point = i => `<Trackpoint><Time>${new Date(Date.parse(start) + i * interval * 1000).toISOString()}</Time>
    <Position><LatitudeDegrees>37</LatitudeDegrees><LongitudeDegrees>127</LongitudeDegrees></Position>
    ${absent ? '' : `<HeartRateBpm><Value>${90 + Math.round(Math.sin(i / 8) * 15)}</Value></HeartRateBpm><AltitudeMeters>${-10 + Math.round(Math.sin(i / 20) * 20)}</AltitudeMeters>`}
    <Extensions><ax:TPX xmlns:ax="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><ax:Speed>${i === 0 ? 0 : (1.3 + Math.sin(i / 10) * .7).toFixed(2)}</ax:Speed></ax:TPX></Extensions>
    </Trackpoint>`;
  return activity({ start }).replace(/<Track>.*?<\/Track>/s, `<Track>${Array.from({ length: count }, (_, i) => point(i)).join('')}</Track>`);
}

// Test-only in-memory database. Any attempted file upload is an immediate failure.
export function fakeDatabase() {
  const rows = new Map(), writes = [], reads = [];
  const client = {
    rows, writes, reads, failNext: false, ambiguousNext: false, raceNext: false,
    storage: { from() { throw new Error('Storage must not be used'); } },
    from(table) {
      let action = 'read', payload, exactCount = false, rangeStart = 0, rangeEnd = Infinity;
      const filters = [];
      const run = () => {
        if (table !== 'records') return { data: [], error: null, count: 0 };
        if (action === 'update' && client.beforeUpdate) { const before = client.beforeUpdate; client.beforeUpdate = null; before(rows); }
        const found = [...rows.values()].filter(row => filters.every(([key, value]) => row[key] === value));
        if (action === 'read') {
          reads.push(filters);
          return { data: structuredClone(found.slice(rangeStart, rangeEnd + 1)), count: exactCount ? found.length : null, error: null };
        }
        writes.push(structuredClone(payload));
        if (client.failNext) { client.failNext = false; return { data: null, error: { message: 'offline' } }; }
        if (action === 'insert' && rows.has(payload.id)) return { data: null, error: { code: '23505' } };
        if (action === 'delete') { found.forEach(r => rows.delete(r.id)); return { data: found, error: null }; }
        if (action === 'update' && !found.length) return { data: [], error: null };
        const next = action === 'update' ? { ...found[0], ...payload } : { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        rows.set(next.id, structuredClone(next));
        if (client.ambiguousNext) { client.ambiguousNext = false; return { data: null, error: { message: 'connection lost after commit' } }; }
        if (client.raceNext) { client.raceNext = false; return { data: null, error: { code: '23505' } }; }
        return { data: [structuredClone(next)], error: null };
      };
      const q = {
        select(_fields, options) { exactCount = Boolean(options?.count); return q; },
        eq(key, value) { filters.push([key, value]); return q; },
        is(key, value) { filters.push([key, value]); return q; },
        lte() { return q; }, order() { return q; },
        range(start, end) { rangeStart = start; rangeEnd = end; return q; },
        insert(value) { action = 'insert'; payload = value; return q; },
        upsert(value) { action = 'insert'; payload = value; return q; },
        update(value) { action = 'update'; payload = value; return q; },
        delete() { action = 'delete'; return q; },
        async maybeSingle() { const result = run(); return { ...result, data: result.data?.[0] || null }; },
        async single() { return q.maybeSingle(); },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return q;
    },
  };
  return client;
}
