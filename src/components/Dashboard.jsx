import { useMemo, useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP, getCategoryThemeStyle } from '../data/categoryDefinitions';
import { APP_VERSION } from '../lib/appVersion';
import { formatMoney, summarizeCategoryTotals, summarizePeriod } from '../utils/recordUtils';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';

const PERIODS = [
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'quarter', label: '분기별' },
  { key: 'year', label: '연간' },
];

function FinanceSummaryModal({ period, summary, categoryTotals, onClose }) {
  const [showBreakdown, setShowBreakdown] = useState(true);

  return (
    <div className="modal-backdrop">
      <section className="finance-summary-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>{period.label} 지출/수입 상세</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="finance-modal-total">
          <span>{summary.range.start.replaceAll('-', '.')} ~ {summary.range.end.replaceAll('-', '.')}</span>
          <strong>{summary.count}건 기록</strong>
        </div>

        <div className="finance-modal-grid">
          <button type="button" onClick={() => setShowBreakdown(true)}>
            <span>지출</span>
            <strong className="expense-text">{formatMoney(summary.expense)}</strong>
          </button>
          <button type="button" onClick={() => setShowBreakdown(false)}>
            <span>수입</span>
            <strong className="income-text">{formatMoney(summary.income)}</strong>
          </button>
        </div>

        {showBreakdown && (
          <div className="finance-breakdown">
            <h3>카테고리별 지출</h3>
            {categoryTotals.filter((item) => item.expense > 0).map((item) => {
              const category = CATEGORY_MAP[item.categoryId];
              return (
                <div key={item.categoryId}>
                  <span>{CATEGORY_ICONS[item.categoryId]} {category?.label || item.categoryId}</span>
                  <strong>{formatMoney(item.expense)}</strong>
                </div>
              );
            })}
            {categoryTotals.filter((item) => item.expense > 0).length === 0 && (
              <p className="empty-text">이 기간의 지출 기록이 없습니다.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Dashboard({
  profile,
  records,
  settings,
  filters,
  onFiltersChange,
  onOpenCategory,
  onAdd,
  onOpenRecord,
  onEdit,
  onDelete,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [showFinanceSummary, setShowFinanceSummary] = useState(false);
  const activePeriod = PERIODS[periodIndex];
  const summary = summarizePeriod(records, settings.finance_modes, activePeriod.key);
  const categoryTotals = summarizeCategoryTotals(records, settings.finance_modes, activePeriod.key);

  const visibleCategories = useMemo(() => {
    const orderIndex = Object.fromEntries(settings.category_order.map((id, index) => [id, index]));
    const mapped = settings.category_order
      .map((id) => CATEGORY_MAP[id])
      .filter(Boolean)
      .filter((category) => !settings.hidden_categories.includes(category.id))
      .map((category) => ({
        category,
        count: records.filter((record) => record.category_id === category.id).length,
      }));

    if (!settings.sort_by_record_count) return mapped;
    return mapped.sort((a, b) => b.count - a.count || orderIndex[a.category.id] - orderIndex[b.category.id]);
  }, [records, settings]);

  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  function cyclePeriod() {
    setPeriodIndex((index) => (index + 1) % PERIODS.length);
  }

  return (
    <main className="screen">
      <section className="topbar compact-topbar">
        <div>
          <p className="eyebrow app-version-label">
            <span>GOODLIFE JOURNAL</span>
            <strong>VERSION {APP_VERSION}</strong>
          </p>
          <h1>
            {profile?.display_name || '사용자'}님의 기록
            <small className="heading-version">v{APP_VERSION}</small>
          </h1>
        </div>
        <button type="button" className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'} onClick={() => setShowSearch(true)} aria-label="검색">
          🔍
        </button>
      </section>

      <section className="summary-strip">
        <div>
          <span>{activePeriod.label} 기록</span>
          <strong>{summary.count}건</strong>
        </div>
        <button type="button" className="summary-money-cell summary-cycle-button" onClick={cyclePeriod}>
          <small>{activePeriod.label}</small>
          <span className="expense-text">지출 {formatMoney(summary.expense)}</span>
          <span className="income-text">수입 {formatMoney(summary.income)}</span>
          <span
            role="button"
            tabIndex={0}
            className="summary-detail-button"
            onClick={(event) => {
              event.stopPropagation();
              setShowFinanceSummary(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setShowFinanceSummary(true);
              }
            }}
          >
            상세
          </span>
        </button>
        <div>
          <button
            type="button"
            className="stats-placeholder-button"
            onClick={() => window.alert('통계 기능은 추후 업데이트 예정입니다.')}
          >
            통계
          </button>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>카테고리</h2>
          <button className="primary-button compact" onClick={(event) => onAdd(null, null, event.currentTarget)}>기록 추가</button>
        </div>
        <div className="category-grid">
          {visibleCategories.map(({ category, count }) => (
            <button className="category-tile" style={getCategoryThemeStyle(category.id)} key={category.id} onClick={(event) => onOpenCategory(category.id, event.currentTarget)}>
              <span className="tile-icon">{CATEGORY_ICONS[category.id]}</span>
              <span className="category-tile-copy">
                <strong>{category.label}</strong>
                <small>{count}개 기록</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>최근 기록</h2>
          <span>{records.length}개</span>
        </div>
        <div className="record-list">
          {records.slice(0, 8).map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {records.length === 0 && <p className="empty-text">아직 기록이 없습니다. 첫 기록을 추가해보세요.</p>}
        </div>
      </section>

      {showFinanceSummary && (
        <FinanceSummaryModal
          period={activePeriod}
          summary={summary}
          categoryTotals={categoryTotals}
          onClose={() => setShowFinanceSummary(false)}
        />
      )}

      {showSearch && (
        <SearchModal
          title="전체 기록 검색"
          records={records}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={() => setShowSearch(false)}
          onOpen={(record, sourceElement) => {
            setShowSearch(false);
            onOpenRecord(record, sourceElement);
          }}
          onEdit={(record) => {
            setShowSearch(false);
            onEdit(record);
          }}
          onDelete={onDelete}
        />
      )}
    </main>
  );
}
