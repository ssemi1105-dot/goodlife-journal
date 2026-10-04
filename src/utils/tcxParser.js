import { SaxesParser } from 'saxes';
import { cleanWorkoutData, workoutImportKey, workoutLocalDate } from './workoutSummary';
import { createWorkoutChartReducer } from './workoutChartData';

export const MAX_TCX_BYTES = 25 * 1024 * 1024;
const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const ACTIVITY_EXTENSIONS = ['http://www.garmin.com/xmlschemas/ActivityExtension/v1', 'http://www.garmin.com/xmlschemas/ActivityExtension/v2'];
const invalid = () => new Error('올바른 TCX 운동 파일이 아닙니다. Zepp에서 다시 내보내주세요.');
const numeric = text => text.trim() && Number.isFinite(Number(text)) && Number(text) >= 0 ? Number(text) : null;
const timestamp = text => /(?:Z|[+-]\d{2}:\d{2})$/i.test(text.trim()) && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;

function sportLabel(sport, notes) {
  if (/걷기|walking|\bwalk\b/i.test(notes)) return '걷기';
  if (/등산|hiking|\bhike\b/i.test(notes)) return '등산';
  if (/수영|swimming|\bswim\b/i.test(notes)) return '수영';
  if (sport === 'Running' || /달리기|러닝|running/i.test(notes)) return '달리기';
  if (sport === 'Biking' || /자전거|cycling|biking/i.test(notes)) return '자전거';
  return '기타';
}

// Streaming reduction: one temporary trackpoint and bounded chart buckets, never a raw point array.
export function createTcxSummaryParser() {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [], activities = [];
  let activity = null, lap = null, point = null, rootSeen = false, elementCount = 0;
  parser.on('error', () => { throw invalid(); });
  parser.on('doctype', () => { throw new Error('외부 문서나 DTD를 포함한 TCX는 가져올 수 없습니다.'); });
  parser.on('opentag', node => {
    if (++elementCount > 1000000 || stack.length >= 40) throw new Error('TCX 구조가 너무 큽니다. 파일을 나누어 가져와주세요.');
    if (!rootSeen) {
      rootSeen = true;
      if (node.local !== 'TrainingCenterDatabase' || node.uri !== TCX_NS) throw invalid();
    }
    const parent = stack.at(-1)?.local;
    stack.push({ local: node.uri === TCX_NS ? node.local : '', name: node.local, uri: node.uri, text: '' });
    if (node.uri !== TCX_NS) return;
    if (node.local === 'Activity' && parent === 'Activities') {
      if (activity || activities.length >= 20) throw new Error('한 파일에서 최대 20개 운동까지 가져올 수 있습니다.');
      activity = { sport: node.attributes.Sport?.value || 'Other', notes: '', idTime: null, first: null, last: null, laps: [], chart: null };
    }
    if (node.local === 'Lap' && parent === 'Activity' && activity) {
      if (activity.laps.length >= 5000) throw new Error('운동 구간이 너무 많습니다. 파일을 나누어 가져와주세요.');
      lap = { start: timestamp(node.attributes.StartTime?.value || ''), duration: null, distance: null, calories: null, avgHr: null, maxHr: null, hrSum: 0, hrCount: 0, hrMax: null, lastDistance: null };
    }
    if (node.local === 'Trackpoint' && parent === 'Track' && activity) point = { time: null, hr: null, altitude: null, speed: null };
  });
  const text = value => {
    const leaf = stack.at(-1);
    if (leaf) leaf.text = (leaf.text + value).slice(0, 512);
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    const leaf = stack.pop(), parent = stack.at(-1)?.local, grandparent = stack.at(-2)?.local;
    if (!activity) return;
    if (point && leaf.name === 'Speed' && ACTIVITY_EXTENSIONS.includes(leaf.uri)
      && stack.at(-1)?.name === 'TPX' && grandparent === 'Extensions' && stack.at(-3)?.local === 'Trackpoint') {
      const speed = numeric(leaf.text);
      point.speed = speed === null ? null : speed * 3.6;
    }
    if (!leaf.local) return;
    const value = leaf.text.trim();
    if (parent === 'Activity' && leaf.local === 'Id') activity.idTime = timestamp(value);
    if (parent === 'Activity' && leaf.local === 'Notes') activity.notes = value;
    if (lap && parent === 'Lap') {
      const key = { TotalTimeSeconds: 'duration', DistanceMeters: 'distance', Calories: 'calories' }[leaf.local];
      if (key) lap[key] = numeric(value);
    }
    if (lap && leaf.local === 'Value') {
      const number = numeric(value);
      if (grandparent === 'Lap' && parent === 'AverageHeartRateBpm') lap.avgHr = number;
      if (grandparent === 'Lap' && parent === 'MaximumHeartRateBpm') lap.maxHr = number;
      if (grandparent === 'Trackpoint' && parent === 'HeartRateBpm' && number > 0) {
        lap.hrSum += number; lap.hrCount += 1; lap.hrMax = Math.max(lap.hrMax || 0, number);
        if (point) point.hr = number;
      }
    }
    if (lap && parent === 'Trackpoint' && leaf.local === 'DistanceMeters') lap.lastDistance = numeric(value) ?? lap.lastDistance;
    if (parent === 'Trackpoint' && leaf.local === 'Time') {
      const time = timestamp(value);
      if (point) point.time = time;
      if (time) { activity.first = !activity.first || time < activity.first ? time : activity.first; activity.last = !activity.last || time > activity.last ? time : activity.last; }
    }
    if (point && parent === 'Trackpoint' && leaf.local === 'AltitudeMeters') point.altitude = value && Number.isFinite(Number(value)) ? Number(value) : null;
    if (leaf.local === 'Trackpoint' && parent === 'Track' && point) {
      if (point.time) {
        if (!activity.chart) activity.chart = createWorkoutChartReducer(Date.parse(activity.idTime || activity.laps.find(l => l.start)?.start || lap?.start || activity.first));
        activity.chart.add(Date.parse(point.time), point.hr, point.altitude, point.speed);
      }
      point = null;
    }
    if (leaf.local === 'Lap' && parent === 'Activity' && lap) { activity.laps.push(lap); lap = null; }
    if (leaf.local === 'Activity' && parent === 'Activities') { activities.push(activity); activity = null; }
  });
  return {
    write(chunk) { parser.write(chunk); },
    async finish() {
      parser.close();
      if (!activities.length) throw new Error('이 파일에 운동 기록이 없습니다. 경로 파일이 아닌 운동 TCX를 선택해주세요.');
      const summaries = [];
      for (const item of activities) {
        const start = item.idTime || item.laps.find(l => l.start)?.start || item.first;
        if (!start || !item.laps.length) throw new Error('운동 시작 시각 또는 구간 정보가 없어 가져올 수 없습니다.');
        const sum = key => item.laps.every(l => l[key] !== null) ? item.laps.reduce((total, l) => total + l[key], 0) : null;
        const durationSeconds = sum('duration') ?? (item.last ? (Date.parse(item.last) - Date.parse(start)) / 1000 : null);
        const distanceMeters = sum('distance') ?? item.laps.at(-1)?.lastDistance ?? null;
        const weighted = item.laps.every(l => l.avgHr > 0 && l.duration > 0);
        const hrCount = item.laps.reduce((total, l) => total + l.hrCount, 0);
        const averageHeartRate = weighted ? Math.round(item.laps.reduce((total, l) => total + l.avgHr * l.duration, 0) / item.laps.reduce((total, l) => total + l.duration, 0))
          : hrCount > 0 ? Math.round(item.laps.reduce((total, l) => total + l.hrSum, 0) / hrCount) : null;
        const maxima = item.laps.map(l => l.maxHr ?? l.hrMax).filter(n => n > 0);
        const activityType = sportLabel(item.sport, item.notes);
        const data = cleanWorkoutData({ source: 'tcx', date: workoutLocalDate(start), activityName: activityType, activityType,
          startedAt: start, endedAt: item.last > start || durationSeconds === 0 ? item.last : null, durationSeconds, distanceMeters, caloriesKcal: sum('calories'),
          averageHeartRate, maxHeartRate: maxima.length ? Math.max(...maxima) : null,
          importKey: await workoutImportKey(start, item.sport),
          chart: item.chart?.finish(),
        });
        summaries.push(data);
      }
      activities.length = 0;
      return summaries;
    },
  };
}
