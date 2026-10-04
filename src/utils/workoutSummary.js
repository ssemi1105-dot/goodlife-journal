import { cleanWorkoutChart } from './workoutChartData';

export const WORKOUT_TYPES = ['걷기', '달리기', '자전거', '수영', '등산', '기타'];
export const WORKOUT_TIME_ZONE = 'Asia/Seoul';
const NUMERIC_FIELDS = ['durationSeconds', 'distanceMeters', 'caloriesKcal', 'averageHeartRate', 'maxHeartRate'];

export function workoutLocalDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: WORKOUT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function workoutTimestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: WORKOUT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function workoutDuration(value) {
  if (value === null || value === undefined || value === '') return '시간 미기록';
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : '', s || (!h && !m) ? `${s}초` : ''].filter(Boolean).join(' ');
}

export function workoutPace(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초/km`;
}

// Explicit allowlist: only summary fields and a bounded chart survive. Never XML, GPS or files.
export function cleanWorkoutData(input = {}) {
  const data = { schemaVersion: 1, source: input.source === 'tcx' ? 'tcx' : 'manual' };
  const date = String(input.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('운동 날짜를 확인해주세요.');
  data.date = date;
  data.activityType = WORKOUT_TYPES.includes(input.activityType) ? input.activityType : '기타';
  data.activityName = String(input.activityName || data.activityType).trim().slice(0, 100) || data.activityType;
  for (const field of NUMERIC_FIELDS) {
    const raw = input[field];
    if (raw === '' || raw === null || raw === undefined) { data[field] = null; continue; }
    if (!['number', 'string'].includes(typeof raw)) throw new Error('운동 측정값을 확인해주세요.');
    const value = Number(String(raw).replaceAll(',', ''));
    if (!Number.isFinite(value) || value < 0 || value > 1e9) throw new Error('운동 측정값을 확인해주세요.');
    data[field] = Math.round(value * 100) / 100;
  }
  for (const field of ['startedAt', 'endedAt']) {
    if (!input[field]) continue;
    if (typeof input[field] !== 'string' || !Number.isFinite(Date.parse(input[field]))) throw new Error('운동 시작/종료 시각을 확인해주세요.');
    data[field] = new Date(input[field]).toISOString();
  }
  if (data.startedAt && data.endedAt && data.endedAt < data.startedAt) throw new Error('운동 종료 시각이 시작 시각보다 빠릅니다.');
  data.timeZone = WORKOUT_TIME_ZONE;
  if (/^[a-f0-9]{64}$/.test(input.importKey || '')) data.importKey = input.importKey;
  data.averageSpeedKmh = data.durationSeconds > 0 && data.distanceMeters !== null ? Math.round(data.distanceMeters / data.durationSeconds * 3600) / 1000 : null;
  data.averagePaceSeconds = data.distanceMeters > 0 && data.durationSeconds > 0 ? Math.round(data.durationSeconds / data.distanceMeters * 10000) / 10 : null;
  if (typeof input.memo === 'string' && input.memo.trim()) data.memo = input.memo.trim().slice(0, 4000);
  const chart = cleanWorkoutChart(input.chart);
  if (chart) data.chart = chart;
  return data;
}

export async function workoutImportKey(startedAt, sport) {
  const bytes = new TextEncoder().encode(`tcx-summary-v1\n${startedAt}\n${sport}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function workoutRecordId(userId, importKey) {
  if (!userId || !/^[a-f0-9]{64}$/.test(importKey || '')) throw new Error('운동 가져오기 정보를 확인해주세요.');
  const hash = await workoutImportKey(userId, importKey);
  // User-scoped, deterministic UUIDv8: retries and simultaneous imports share the same row ID.
  const hex = `${hash.slice(0, 12)}8${hash.slice(13, 16)}${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 32)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
