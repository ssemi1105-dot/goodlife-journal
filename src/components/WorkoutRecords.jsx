import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatWorkoutMonth, getWorkoutRecordDate, groupWorkoutsByMonth, summarizeWorkouts, workoutMetricNumber } from '../utils/workoutMonths';
import { workoutDuration, workoutLocalDate, workoutTimestamp } from '../utils/workoutSummary';

const number = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const distance = value => value === null ? '거리 미기록' : `${number(value / 1000)}km`;
function compactDuration(value) {
  if (value === null) return '미기록';
  const seconds = Math.round(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}시간 ${minutes}분` : minutes ? `${minutes}분` : `${seconds}초`;
}

function WorkoutTotals({ summary }) {
  const values = [
    ['distanceMeters', '기록 거리', summary.distanceMeters === null ? '미기록' : distance(summary.distanceMeters)],
    ['durationSeconds', '운동 시간', compactDuration(summary.durationSeconds)],
    ['caloriesKcal', '칼로리', summary.caloriesKcal === null ? '미기록' : `${number(summary.caloriesKcal)}kcal`],
  ];
  return <div className="workout-month-totals">
    {values.map(([field, label, value]) => <div key={field} title={`${summary.measured[field]}/${summary.count}건 기록${field === 'durationSeconds' ? ` · ${workoutDuration(summary.durationSeconds)}` : ''}`}>
      <span>{label}</span><strong>{value}</strong>
    </div>)}
  </div>;
}

export function WorkoutMonthlyList({ records, onOpenMonth }) {
  const months = useMemo(() => groupWorkoutsByMonth(records), [records]);
  return <section className="workout-month-list" aria-label="운동 월별 요약">
    {months.map(group => <button type="button" className="workout-month-card" key={group.month} onClick={() => onOpenMonth(group.month)} aria-label={`${formatWorkoutMonth(group.month)} 운동 내역 보기`}>
      <span className="workout-month-heading"><strong>{formatWorkoutMonth(group.month)}</strong><span>{group.count}회 <span aria-hidden="true">›</span></span></span>
      <WorkoutTotals summary={group} />
    </button>)}
    {!months.length && <p className="empty-text">운동 기록이 없습니다.</p>}
  </section>;
}

export function WorkoutMonthModal({ records, month, onClose, onOpenRecord }) {
  const panelRef = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const group = useMemo(() => groupWorkoutsByMonth(records).find(item => item.month === month), [records, month]);
  const entries = group?.records || [];
  useEffect(() => {
    const previousFocus = document.activeElement, panel = panelRef.current;
    panel.querySelector('button')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<div className="modal-backdrop workout-month-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-modal workout-month-modal" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="workout-month-title">
      <header className="modal-header">
        <div><p className="eyebrow">운동기록 · {entries.length}회</p><h2 id="workout-month-title">{formatWorkoutMonth(month)}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
      </header>
      <WorkoutTotals summary={group || summarizeWorkouts([])} />
      <div className="workout-month-entries" aria-label="날짜별 운동 내역">
        {entries.map(record => {
          const data = record.data || {}, date = getWorkoutRecordDate(record);
          const time = date && data.startedAt && workoutLocalDate(data.startedAt) === date ? workoutTimestamp(data.startedAt).slice(11, 16) : '';
          const calories = workoutMetricNumber(data.caloriesKcal);
          return <button type="button" className="workout-month-entry" key={record.id} onClick={event => onOpenRecord(record, event.currentTarget)}>
            <span className="workout-entry-main">
              <time dateTime={date || undefined}>{date ? date.replaceAll('-', '.') : '일자 미기록'}{time ? ` · ${time}` : ''}</time>
              <strong>{data.activityName || record.title || data.activityType || '운동'}</strong>
              <span>{workoutDuration(workoutMetricNumber(data.durationSeconds))}{calories !== null ? ` · ${number(calories)}kcal` : ''}</span>
            </span>
            <strong className="workout-entry-distance">{distance(workoutMetricNumber(data.distanceMeters))}</strong>
            <span className="workout-entry-arrow" aria-hidden="true">›</span>
          </button>;
        })}
        {!entries.length && <p className="empty-text">이 달에 남아 있는 운동 기록이 없습니다.</p>}
      </div>
    </section>
  </div>, document.body);
}
