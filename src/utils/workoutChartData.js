export const MAX_WORKOUT_CHART_POINTS = 180;
const MAX_SECONDS = 31 * 86400;
const CHANNEL_LIMITS = [[1, 400], [-12000, 100000], [0, 500]];
const round = value => Math.round(value * 10) / 10;

function channelValue(value, channel) {
  const [min, max] = CHANNEL_LIMITS[channel];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? round(value) : null;
}

// Rows: [elapsed seconds, heart rate bpm, altitude m, speed km/h]. Null means unmeasured.
// Only a bounded numeric matrix can cross the save boundary; no extra keys or raw samples.
export function cleanWorkoutChart(chart) {
  if (!chart || chart.version !== 1 || chart.method !== 'time-bucket-mean'
    || !Array.isArray(chart.points) || !chart.points.length || chart.points.length > MAX_WORKOUT_CHART_POINTS
    || !Number.isFinite(chart.durationSeconds) || chart.durationSeconds < 0 || chart.durationSeconds > MAX_SECONDS
    || !Number.isFinite(chart.intervalSeconds) || chart.intervalSeconds < 1 || chart.intervalSeconds > MAX_SECONDS) return null;
  const points = [];
  let previous = -1, measured = false;
  for (const row of chart.points) {
    if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== 'number' || !Number.isFinite(row[0])) return null;
    const time = round(row[0]);
    if (time < 0 || time <= previous || time > chart.durationSeconds) return null;
    const values = row.slice(1).map(channelValue);
    measured ||= values.some(value => value !== null);
    points.push([time, ...values]);
    previous = time;
  }
  return measured ? { version: 1, method: 'time-bucket-mean', intervalSeconds: chart.intervalSeconds,
    durationSeconds: chart.durationSeconds, points } : null;
}

function emptyBucket() { return { time: 0, count: 0, sum: [0, 0, 0], counts: [0, 0, 0] }; }
function mergeBucket(target, source) {
  target.time += source.time;
  target.count += source.count;
  for (let i = 0; i < 3; i += 1) { target.sum[i] += source.sum[i]; target.counts[i] += source.counts[i]; }
}

// Coarsen time buckets as the workout grows: memory never grows with trackpoint count.
export function createWorkoutChartReducer(startMs) {
  let interval = 1, lastTime = 0, buckets = new Map();
  return {
    add(timeMs, heartRate, altitude, speedKmh) {
      const time = (timeMs - startMs) / 1000;
      if (!Number.isFinite(time) || time < 0 || time > MAX_SECONDS) return;
      while (Math.floor(time / interval) >= MAX_WORKOUT_CHART_POINTS) {
        interval *= 2;
        const merged = new Map();
        for (const [index, bucket] of buckets) {
          const key = Math.floor(index / 2);
          if (!merged.has(key)) merged.set(key, emptyBucket());
          mergeBucket(merged.get(key), bucket);
        }
        buckets = merged;
      }
      lastTime = Math.max(lastTime, time);
      const index = Math.floor(time / interval);
      if (!buckets.has(index)) buckets.set(index, emptyBucket());
      const bucket = buckets.get(index);
      bucket.time += time; bucket.count += 1;
      [heartRate, altitude, speedKmh].forEach((value, channel) => {
        if (channelValue(value, channel) !== null) { bucket.sum[channel] += value; bucket.counts[channel] += 1; }
      });
    },
    finish() {
      const points = Array.from({ length: Math.floor(lastTime / interval) + 1 }, (_, index) => {
        const bucket = buckets.get(index);
        const time = bucket ? bucket.time / bucket.count : Math.min(lastTime, (index + 0.5) * interval);
        return [round(time), ...[0, 1, 2].map(channel => bucket?.counts[channel] ? round(bucket.sum[channel] / bucket.counts[channel]) : null)];
      });
      buckets.clear();
      return cleanWorkoutChart({ version: 1, method: 'time-bucket-mean', intervalSeconds: interval, durationSeconds: Math.ceil(lastTime), points });
    },
  };
}
