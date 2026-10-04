import { workoutLocalDate } from './workoutSummary';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
}

export function getWorkoutRecordDate(record) {
  return validDate(record.occurred_on) || validDate(record.data?.date)
    || (record.data?.startedAt ? workoutLocalDate(record.data.startedAt) : '');
}

export function workoutMetricNumber(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const number = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeWorkouts(records = []) {
  const own = records.filter(record => record.category_id === 'workout');
  const summary = { count: own.length, measured: {} };
  for (const field of ['distanceMeters', 'durationSeconds', 'caloriesKcal']) {
    const values = own.map(record => workoutMetricNumber(record.data?.[field])).filter(value => value !== null);
    summary.measured[field] = values.length;
    summary[field] = values.length || !own.length ? values.reduce((total, value) => total + value, 0) : null;
  }
  return summary;
}

export function formatWorkoutMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month.slice(0, 4)}년 ${Number(month.slice(5))}월` : '날짜 미지정';
}

// Display-only grouping: recorded dates take precedence over the original TCX start timestamp.
export function groupWorkoutsByMonth(records = []) {
  const groups = new Map();
  for (const record of records) {
    if (record.category_id !== 'workout') continue;
    const month = getWorkoutRecordDate(record).slice(0, 7) || 'unknown';
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(record);
  }
  return [...groups].sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a))
    .map(([month, entries]) => ({ month, ...summarizeWorkouts(entries), records: [...entries].sort((a, b) =>
      getWorkoutRecordDate(b).localeCompare(getWorkoutRecordDate(a))
      || String(b.data?.startedAt || '').localeCompare(String(a.data?.startedAt || ''))
      || String(b.created_at || '').localeCompare(String(a.created_at || ''))
      || String(b.id || '').localeCompare(String(a.id || ''))) }));
}
