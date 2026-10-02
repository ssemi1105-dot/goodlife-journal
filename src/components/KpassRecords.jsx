import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { calcKpass, formatKpassMonth, formatMoney, getKpassRecordDate, groupKpassByMonth, summarizeKpass } from '../utils/recordUtils';

function KpassAmounts({ chargeAmount, refundAmount }) {
  return (
    <div className="kpass-amounts">
      <div><span>충전비용</span><strong>{formatMoney(chargeAmount)}</strong></div>
      <div><span>환급비용</span><strong className="kpass-refund">{formatMoney(refundAmount)}</strong></div>
    </div>
  );
}

export function KpassSummary({ records }) {
  const summary = summarizeKpass(records);
  return (
    <section className="category-summary-strip kpass-summary-strip" aria-label="K-pass 전체 합계">
      <div><span>총 충전비용</span><strong>{formatMoney(summary.chargeAmount)}</strong></div>
      <div><span>총 환급비용</span><strong className="kpass-refund">{formatMoney(summary.refundAmount)}</strong></div>
      <div><span>환급률</span><strong>{summary.refundRate}%</strong></div>
    </section>
  );
}

export function KpassMonthlyList({ records, onOpenMonth }) {
  const months = groupKpassByMonth(records);
  return (
    <section className="kpass-month-list" aria-label="K-pass 월별 내역">
      {months.map((group) => (
        <button type="button" className="kpass-month-card" key={group.month} onClick={() => onOpenMonth(group.month)} aria-label={`${formatKpassMonth(group.month)} 내역 보기`}>
          <span className="kpass-month-heading">
            <strong>{formatKpassMonth(group.month)}</strong>
            <span>{group.records.length}건 <span aria-hidden="true">›</span></span>
          </span>
          <KpassAmounts {...group} />
        </button>
      ))}
      {months.length === 0 && <p className="empty-text">K-pass 기록이 없습니다.</p>}
    </section>
  );
}

export function KpassMonthModal({ records, month, onClose, onOpenRecord }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const group = groupKpassByMonth(records).find((item) => item.month === month);
  const entries = group?.records || [];

  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    panel.querySelector('button')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop kpass-month-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-modal kpass-month-modal" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="kpass-month-title">
        <header className="modal-header">
          <div><p className="eyebrow">K-pass</p><h2 id="kpass-month-title">{formatKpassMonth(month)}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <KpassAmounts chargeAmount={group?.chargeAmount || 0} refundAmount={group?.refundAmount || 0} />
        <div className="kpass-transactions" aria-label="날짜별 충전·환급 내역">
          {entries.map((record) => {
            const amounts = calcKpass(record.data || {});
            const date = getKpassRecordDate(record);
            return (
              <button type="button" className="kpass-transaction" key={record.id} onClick={(event) => onOpenRecord(record, event.currentTarget)}>
                <span className="kpass-transaction-meta">
                  <time dateTime={date || undefined}>{date ? date.replaceAll('-', '.') : '일자 미기록'}</time>
                  {record.data?.memo && <span className="kpass-transaction-memo">{record.data.memo}</span>}
                </span>
                <span className="kpass-transaction-values">
                  {amounts.chargeAmount !== 0 && <span>충전 <strong>{formatMoney(amounts.chargeAmount)}</strong></span>}
                  {amounts.refundAmount !== 0 && <span className="kpass-refund">환급 <strong>{formatMoney(amounts.refundAmount)}</strong></span>}
                  {amounts.chargeAmount === 0 && amounts.refundAmount === 0 && <span>충전·환급 0원</span>}
                </span>
                <span className="kpass-transaction-arrow" aria-hidden="true">›</span>
              </button>
            );
          })}
          {entries.length === 0 && <p className="empty-text">이 달에 남아 있는 기록이 없습니다.</p>}
        </div>
      </section>
    </div>, document.body,
  );
}
