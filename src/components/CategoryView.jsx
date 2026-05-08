import { useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, formatMoney } from '../utils/recordUtils';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';

function InvestmentPortfolio({ records }) {
  const summary = records.reduce(
    (total, record) => {
      const calc = calcInvestment(record.data || {});
      total.buyTotal += calc.buyTotal;
      total.currentTotal += calc.currentTotal;
      return total;
    },
    { buyTotal: 0, currentTotal: 0 },
  );
  const profit = summary.currentTotal - summary.buyTotal;
  const rate = summary.buyTotal > 0 ? (profit / summary.buyTotal) * 100 : 0;

  return (
    <section className="portfolio-panel">
      <div className="portfolio-header">
        <div>
          <p className="eyebrow">My Account</p>
          <h2>투자 계좌 요약</h2>
        </div>
        <button className="secondary-button" type="button" title="주가 API 연결 후 자동 갱신됩니다.">
          주가 새로고침
        </button>
      </div>
      <div className="portfolio-total">
        <span>총 평가금액</span>
        <strong>{formatMoney(summary.currentTotal)}</strong>
        <small className={profit >= 0 ? 'profit-plus' : 'profit-minus'}>
          {profit >= 0 ? '+' : ''}{formatMoney(profit)} · {rate.toFixed(2)}%
        </small>
      </div>
      <div className="portfolio-grid">
        <div>
          <span>총 매수금액</span>
          <strong>{formatMoney(summary.buyTotal)}</strong>
        </div>
        <div>
          <span>보유 종목</span>
          <strong>{records.length}개</strong>
        </div>
      </div>
    </section>
  );
}

export default function CategoryView({ categoryId, records, onBack, onAdd, onOpenRecord, onEdit, onDelete }) {
  const category = CATEGORY_MAP[categoryId];
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState({ query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' });
  const categoryRecords = records.filter((record) => record.category_id === categoryId);
  const isInvestment = categoryId === 'investment';
  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  return (
    <main className="screen">
      <header className="sub-header mobile-sub-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로">‹</button>
        <div className="tile-icon" style={{ background: `${category.color}18`, color: category.color }}>{CATEGORY_ICONS[category.id]}</div>
        <div className="sub-header-title">
          <p className="eyebrow">Category</p>
          <h1>{category.label}</h1>
        </div>
        <button type="button" className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'} onClick={() => setShowSearch(true)} aria-label="검색">🔍</button>
        <button className="primary-button compact" onClick={() => onAdd(categoryId)}>추가</button>
      </header>

      {isInvestment && <InvestmentPortfolio records={categoryRecords} />}

      <section className="record-list">
        {categoryRecords.map((record) => (
          <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {categoryRecords.length === 0 && <p className="empty-text">이 카테고리의 기록이 없습니다.</p>}
      </section>

      {showSearch && (
        <SearchModal
          title={`${category.label} 검색`}
          records={categoryRecords}
          filters={filters}
          onFiltersChange={setFilters}
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
