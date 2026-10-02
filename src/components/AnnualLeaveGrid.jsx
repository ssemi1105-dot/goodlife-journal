import { groupAnnualLeave, numberText } from '../utils/recordPresentation';
import RecordCard from './RecordCard';

export default function AnnualLeaveGrid({ records, onOpenRecord, onEdit, onDelete }) {
  const years = groupAnnualLeave(records);
  return (
    <section className="leave-year-list" aria-label="연차 사용 달력형 목록">
      {years.map((group) => <section className="leave-year-section" key={group.year}>
        <header><h2>{group.year}년</h2><span>사용 기록 {group.uses.length}건</span></header>
        {group.grants.map((record) => <button type="button" className="leave-grant-row" key={record.id} onClick={(event) => onOpenRecord(record, event.currentTarget)}>
          <span>연차 부여</span><strong>{numberText(record.data?.grantDays)}일</strong><span aria-hidden="true">›</span>
        </button>)}
        <div className="leave-keypad-grid">
          {group.uses.map((record) => {
            const date = record.data?.date || record.occurred_on || '';
            const days = numberText(record.data?.days);
            return <button type="button" className="leave-day-tile" key={record.id} aria-label={`${date || '날짜 미지정'} 연차 ${days}일 사용`} onClick={(event) => onOpenRecord(record, event.currentTarget)}>
              <time dateTime={date || undefined}>{date ? date.slice(5).replace('-', '.') : '미지정'}</time>
              <strong>{days}<small>일</small></strong>
            </button>;
          })}
        </div>
        {group.uses.length === 0 && <p className="empty-text compact-empty">사용한 연차 기록이 없습니다.</p>}
        {group.others.map((record) => <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} showCategory={false} />)}
      </section>)}
      {years.length === 0 && <p className="empty-text">연차 기록이 없습니다.</p>}
    </section>
  );
}
