import { useMemo, useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { APP_VERSION } from '../lib/appVersion';
import { formatMoney, summarizePeriod } from '../utils/recordUtils';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';

const PERIODS = [
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'quarter', label: '분기별' },
  { key: 'year', label: '연간' },
];

function MiniSparkline({ points, trend }) {
  return (
    <svg className={`summary-sparkline ${trend}`} viewBox="0 0 120 36" aria-hidden="true">
      <defs>
        <linearGradient id="premiumSparkline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#2C4A3B" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="url(#premiumSparkline)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getSparklinePoints(summary, periodIndex) {
  const income = Math.max(0, summary.income || 0);
  const expense = Math.max(0, summary.expense || 0);
  const net = income - expense;
  const base = net >= 0 ? 24 : 14;
  const shift = Math.min(10, Math.abs(net) / Math.max(income + expense, 1) * 10);
  const variants = [
    `4,24 24,20 44,22 64,16 84,18 116,${base - shift}`,
    `4,22 24,18 44,20 64,14 84,16 116,${base - shift}`,
    `4,25 24,21 44,17 64,20 84,14 116,${base - shift}`,
    `4,26 24,23 44,19 64,15 84,17 116,${base - shift}`,
  ];
  return variants[periodIndex] || variants[0];
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
  const activePeriod = PERIODS[periodIndex];
  const summary = summarizePeriod(records, settings.finance_modes, activePeriod.key);
  const netFlow = summary.income - summary.expense;
  const trend = netFlow >= 0 ? 'is-up' : 'is-down';

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
  const sparklinePoints = getSparklinePoints(summary, periodIndex);

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
        <button
          type="button"
          className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'}
          onClick={() => setShowSearch(true)}
          aria-label="검색"
        >
          🔍
        </button>
      </section>

      <section className="summary-strip premium-summary-strip">
        <div className="summary-count-card">
          <span>{activePeriod.label} 기록</span>
          <strong>{summary.count}건</strong>
        </div>

        <button
          type="button"
          className="summary-money-cell summary-cycle-button premium-summary-card"
          onClick={cyclePeriod}
          aria-label="기간 변경"
        >
          <span className="summary-card-head">
            <small className="period-chip">{activePeriod.label}</small>
            <em>터치해서 기간 변경</em>
          </span>
          <span className="summary-amount-lines">
            <span className="expense-text">지출 {formatMoney(summary.expense)}</span>
            <span className="income-text">수입 {formatMoney(summary.income)}</span>
          </span>
          <span className={`trend-pill ${trend}`}>
            {netFlow >= 0 ? '↗' : '↘'} 순흐름 {formatMoney(Math.abs(netFlow))}
          </span>
          <MiniSparkline points={sparklinePoints} trend={trend} />
        </button>

        <div className="summary-stats-card">
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
          <button className="primary-button compact" onClick={() => onAdd(null)}>기록 추가</button>
        </div>
        <div className="category-grid">
          {visibleCategories.map(({ category, count }) => (
            <button className="category-tile" key={category.id} onClick={() => onOpenCategory(category.id)}>
              <span className="tile-icon" style={{ background: `${category.color}18`, color: category.color }}>{CATEGORY_ICONS[category.id]}</span>
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

      {showSearch && (
        <SearchModal
          title="전체 기록 검색"
          records={records}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={() => setShowSearch(false)}
          onOpen={(record) => {
            setShowSearch(false);
            onOpenRecord(record);
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
