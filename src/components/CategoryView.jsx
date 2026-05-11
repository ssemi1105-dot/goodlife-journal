import { useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, formatMoney, getRecordFinanceValue, toNumber } from '../utils/recordUtils';
import { fetchKisPrice } from '../services/kisApiClient';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';
import InvestmentMoodImage from './ui/InvestmentMoodImage';

function InvestmentPortfolio({ records, onPriceUpdate }) {
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

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
  const profitClass = profit >= 0 ? 'profit-plus' : 'profit-minus';

  async function handleRefresh() {
    if (!onPriceUpdate) {
      window.alert('현재가를 저장할 업데이트 함수가 연결되지 않았습니다.');
      return;
    }

    const investmentRecords = records.filter((record) => record.data?.symbol);
    if (investmentRecords.length === 0) {
      window.alert('종목코드가 입력된 항목이 없습니다.');
      return;
    }

    setLoading(true);
    let successCount = 0;
    const failedSymbols = [];

    try {
      for (const record of investmentRecords) {
        const { symbol, market, quantity, avgBuyPrice } = record.data;
        try {
          const result = await fetchKisPrice({ symbol, market: market || 'KR' });
          const currentPrice = toNumber(result?.currentPrice);
          if (!currentPrice) throw new Error('현재가 응답이 비어 있습니다.');

          const safeQuantity = toNumber(quantity);
          const buyAmount = toNumber(avgBuyPrice) * safeQuantity;
          const currentAmount = currentPrice * safeQuantity;
          const profitLoss = currentAmount - buyAmount;
          const profitLossRate = buyAmount > 0 ? (profitLoss / buyAmount) * 100 : 0;

          await onPriceUpdate(record.id, {
            ...record.data,
            currentPrice,
            currentAmount,
            profitLoss,
            profitLossRate,
            priceFetchedAt: result.fetchedAt || new Date().toISOString(),
          });
          successCount += 1;
        } catch (err) {
          console.error(`${symbol} 조회 실패:`, err);
          failedSymbols.push(symbol);
        }
      }

      const updatedAt = new Date().toLocaleTimeString('ko-KR');
      setLastUpdated(updatedAt);
      if (failedSymbols.length > 0) {
        window.alert(`${successCount}개 종목 업데이트 완료, ${failedSymbols.length}개 실패: ${failedSymbols.join(', ')}`);
      } else {
        window.alert(`${successCount}개 종목 현재가를 업데이트했습니다.`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`portfolio-panel investment-account-card ${profit > 0 ? 'is-positive' : profit < 0 ? 'is-negative' : 'is-neutral'}`}>
      <InvestmentMoodImage rate={rate} background />
      <div className="investment-account-overlay" aria-hidden="true" />

      <div className="portfolio-header investment-account-header">
        <div>
          <p className="eyebrow">My Account</p>
          <h2>투자계좌 현황</h2>
        </div>
        <div className="investment-refresh-group">
          <button
            className="secondary-button investment-refresh-button"
            type="button"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '조회 중...' : '주가 새로고침'}
          </button>
          {lastUpdated && <span>마지막 업데이트: {lastUpdated}</span>}
        </div>
      </div>

      <div className="investment-account-content">
        <div className="investment-main-value readable-value-panel">
          <span>현재평가금액</span>
          <strong>{formatMoney(summary.currentTotal)}</strong>
        </div>

        <div className="investment-account-metrics">
          <div className="readable-value-panel">
            <span>매수총액</span>
            <strong>{formatMoney(summary.buyTotal)}</strong>
          </div>
          <div className="readable-value-panel">
            <span>수익금</span>
            <strong className={profitClass}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</strong>
          </div>
          <div className="readable-value-panel">
            <span>수익률</span>
            <strong className={profitClass}>{profit >= 0 ? '+' : ''}{rate.toFixed(2)}%</strong>
          </div>
          <div className="readable-value-panel">
            <span>보유종목</span>
            <strong>{records.length}개</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function CategorySummary({ records }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const totals = records.reduce(
    (summary, record) => {
      const value = getRecordFinanceValue(record, { [record.category_id]: 'expense' });
      summary.total += value.expense;
      if (record.occurred_on?.startsWith(currentMonth)) summary.month += value.expense;
      return summary;
    },
    { total: 0, month: 0 },
  );

  return (
    <section className="category-summary-strip">
      <div>
        <span>총 지출</span>
        <strong>{formatMoney(totals.total)}</strong>
      </div>
      <div>
        <span>이번 달 지출</span>
        <strong>{formatMoney(totals.month)}</strong>
      </div>
    </section>
  );
}

export default function CategoryView({ categoryId, records, onBack, onAdd, onOpenRecord, onEdit, onDelete, onUpdateRecord }) {
  const category = CATEGORY_MAP[categoryId];
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState({ query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' });
  const categoryRecords = records.filter((record) => record.category_id === categoryId);
  const isInvestment = categoryId === 'investment';
  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  return (
    <main className="screen">
      <header className="sub-header mobile-sub-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로">←</button>
        <div className="tile-icon" style={{ background: `${category.color}18`, color: category.color }}>{CATEGORY_ICONS[category.id]}</div>
        <div className="sub-header-title">
          <p className="eyebrow">Category</p>
          <h1>{category.label}</h1>
        </div>
        <button type="button" className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'} onClick={() => setShowSearch(true)} aria-label="검색">🔍</button>
        <button className="primary-button compact" onClick={() => onAdd(categoryId)}>추가</button>
      </header>

      {isInvestment && <InvestmentPortfolio records={categoryRecords} onPriceUpdate={onUpdateRecord} />}
      {!isInvestment && <CategorySummary records={categoryRecords} />}

      <section className="record-list">
        {categoryRecords.map((record) => (
          <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {categoryRecords.length === 0 && <p className="empty-text">이 카테고리에 기록이 없습니다.</p>}
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
