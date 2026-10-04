import { cleanWorkoutData, workoutRecordId } from '../utils/workoutSummary';
import { cleanWorkoutChart } from '../utils/workoutChartData';

export async function persistWorkoutImport(client, userId, summary) {
  if (!userId) throw new Error('로그인 후 다시 시도해주세요.');
  const data = cleanWorkoutData(summary);
  if (data.source !== 'tcx' || !data.importKey) throw new Error('TCX 요약 정보를 확인해주세요.');
  const id = await workoutRecordId(userId, data.importKey);
  async function findExisting() {
    const result = await client.from('records').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    if (result.error) throw result.error;
    if (result.data && (result.data.user_id !== userId || result.data.category_id !== 'workout' || result.data.data?.importKey !== data.importKey)) throw new Error('기존 운동 기록을 확인하지 못했습니다.');
    return result.data;
  }
  async function supplementChart(existing) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!data.chart || cleanWorkoutChart(existing.data?.chart)) return { record: existing, duplicate: true };
      // Preserve all edited summary fields. Optimistic locking prevents a concurrent edit being lost.
      let query = client.from('records').update({ data: { ...existing.data, chart: data.chart }, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId);
      query = existing.updated_at ? query.eq('updated_at', existing.updated_at) : query.is('updated_at', null);
      const result = await query.select().maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return { record: result.data, duplicate: false, enriched: true };
      existing = await findExisting();
      if (!existing) break;
    }
    throw new Error('기록이 변경되었습니다. 다시 가져오면 그래프를 보완할 수 있습니다.');
  }
  const existing = await findExisting();
  if (existing) return supplementChart(existing);
  const payload = { id, user_id: userId, category_id: 'workout', occurred_on: data.date, title: data.activityName,
    amount: 0, income_amount: 0, visibility: 'private', data };
  // Never upload a file or replace a previously imported summary.
  const result = await client.from('records').insert(payload).select().single();
  if (result.error?.code === '23505') {
    const concurrent = await findExisting();
    if (concurrent) return supplementChart(concurrent);
  }
  if (result.error) throw result.error;
  return { record: result.data, duplicate: false };
}
