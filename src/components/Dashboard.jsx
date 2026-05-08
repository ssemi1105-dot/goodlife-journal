import { useMemo, useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { formatMoney, summarizeMonth } from '../utils/recordUtils';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';

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
  const month = summarizeMonth(records, settings.finance_modes);

  const visibleCategories = useMemo(() => {
    const orderIndex = Object.fromEntries(settings.category_order.map((id, index) => [id, index]));
    return settings.category_order
      .map((id) => CATEGORY_MAP[id])
      .filter(Boolean)
      .filter((category) => !settings.hidden_categories.includes(category.id))
      .map((category) => ({
        category,
        count: records.filter((record) => record.category_id === category.id).length,
      }))
      .sort((a, b) => b.count - a.count || orderIndex[a.category.id] - orderIndex[b.category.id]);
  }, [records, settings]);

  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  return (
    <main className="screen">
      <section className="topbar compact-topbar">
        <div>
          <p className="eyebrow">Goodlife Journal</p>
          <h1>{profile?.display_name || '사용자'}님의 기록</h1>
        </div>
        <button type="button" className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'} onClick={() => setShowSearch(true)} aria-label="검색">
          🔍
        </button>
      </section>

      <section className="summary-strip">
        <div>
          <span>지출</span>
          <strong>{formatMoney(month.expense)}</strong>
        </div>
        <div>
          <span>수입</span>
          <strong className="income-text">{formatMoney(month.income)}</strong>
        </div>
        <div>
          <span>순수입</span>
          <strong className={month.income - month.expense >= 0 ? 'income-text' : 'expense-text'}>
            {formatMoney(month.income - month.expense)}
          </strong>
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
              <strong>{category.label}</strong>
              <small>{count}개 기록</small>
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
