import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcAnnualLeave, calcInvestment, calcKpass, formatMoney, getInvestmentRecordType, getRecordFinanceValue, toNumber } from '../utils/recordUtils';
import { fetchKisPrice } from '../services/kisApiClient';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';
import InvestmentMoodImage from './ui/InvestmentMoodImage';

function InvestmentPortfolio({ records, onPriceUpdate }) {
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshMessage, setRefreshMessage] = useState('자동 갱신 대기 중');
  const refreshRunningRef = useRef(false);
  const recordsRef = useRef(records);
  const onPriceUpdateRef = useRef(onPriceUpdate);

  useEffect(() => {
    recordsRef.current = records;
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onPriceUpdate, records]);

  const holdingRecords = records.filter((record) => getInvestmentRecordType(record.data || {}) === 'holding');
  const summary = holdingRecords.reduce(
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
  const hasQuoteValue = (value) => value !== null && value !== undefined && value !== '';

  const handleRefresh = useCallback(async ({ silent = false } = {}) => {
    if (refreshRunningRef.current) return;
    const updatePrice = onPriceUpdateRef.current;
    const currentRecords = recordsRef.current;

    if (!updatePrice) {
      setRefreshMessage('현재가 저장 함수가 연결되지 않았습니다.');
      return;
    }

    const investmentRecords = currentRecords.filter((record) => record.data?.symbol && getInvestmentRecordType(record.data || {}) !== 'sold');
    if (investmentRecords.length === 0) {
      setRefreshMessage('종목코드가 입력된 항목이 없습니다.');
      return;
    }

    refreshRunningRef.current = true;
    setLoading(true);
    if (!silent) setRefreshMessage('현재가 조회 중...');
    let successCount = 0;
    const failedSymbols = [];

    try {
      for (const record of investmentRecords) {
        const { symbol, market, quantity, avgBuyPrice } = record.data;
        const recordType = getInvestmentRecordType(record.data || {});
        try {
          const result = await fetchKisPrice({ symbol, market: market || 'KR' });
          const currentPrice = toNumber(result?.currentPrice);
          if (!currentPrice) throw new Error('현재가 응답이 비어 있습니다.');
          const quotePatch = {
            currentPrice,
            ...(hasQuoteValue(result?.previousClose) ? { previousClose: toNumber(result.previousClose) } : {}),
            ...(hasQuoteValue(result?.priceChange) ? { priceChange: toNumber(result.priceChange) } : {}),
            ...(hasQuoteValue(result?.priceChangeRate) ? { priceChangeRate: toNumber(result.priceChangeRate) } : {}),
            priceFetchedAt: result.fetchedAt || new Date().toISOString(),
          };

          const safeQuantity = toNumber(quantity);
          const buyAmount = recordType === 'holding' ? toNumber(avgBuyPrice) * safeQuantity : 0;
          const currentAmount = recordType === 'holding' ? currentPrice * safeQuantity : 0;
          const profitLoss = currentAmount - buyAmount;
          const profitLossRate = buyAmount > 0 ? (profitLoss / buyAmount) * 100 : 0;

          const previousPrice = toNumber(record.data?.currentPrice);
          const quoteChanged = Object.entries(quotePatch)
            .filter(([key]) => key !== 'priceFetchedAt')
            .some(([key, value]) => record.data?.[key] !== value);
          if (previousPrice !== currentPrice || toNumber(record.data?.currentAmount) !== currentAmount || quoteChanged) {
            await updatePrice(record.id, {
              ...record.data,
              ...quotePatch,
              ...(recordType === 'holding' ? { currentAmount, profitLoss, profitLossRate } : {}),
            });
          }
          successCount += 1;
        } catch (err) {
          console.error(`${symbol} 조회 실패:`, err);
          failedSymbols.push(symbol);
        }
      }

      const updatedAt = new Date().toLocaleTimeString('ko-KR');
      setLastUpdated(updatedAt);
      if (failedSymbols.length > 0) {
        setRefreshMessage(`${successCount}개 확인, ${failedSymbols.length}개 실패`);
      } else {
        setRefreshMessage(`${successCount}개 종목 자동 갱신 완료`);
      }
    } finally {
      setLoading(false);
      refreshRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    handleRefresh({ silent: true });
    const timer = window.setInterval(() => {
      handleRefresh({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [handleRefresh]);

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
            onClick={() => handleRefresh()}
            disabled={loading}
          >
            {loading ? '조회 중...' : '수동 갱신'}
          </button>
          {lastUpdated && <span>마지막 업데이트: {lastUpdated}</span>}
          <span>{refreshMessage}</span>
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
            <strong>{holdingRecords.length}개</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function InvestmentRecordSections({ records, onOpenRecord, onEdit, onDelete, onAdd }) {
  const groups = [
    { id: 'holding', title: '보유종목', empty: '보유 중인 종목이 없습니다.' },
    { id: 'watch', title: '관심종목', empty: '추적 중인 관심종목이 없습니다.' },
    { id: 'sold', title: '매도기록', empty: '매도 기록이 없습니다.' },
  ];
  const grouped = groups.reduce((result, group) => {
    result[group.id] = records
      .filter((record) => getInvestmentRecordType(record.data || {}) === group.id)
      .sort((a, b) => `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`));
    return result;
  }, {});

  function openSellRecord(record) {
    const data = record.data || {};
    const sellDate = todayLocalIso();
    onAdd('investment', {
      date: sellDate,
      sellDate,
      recordType: 'sold',
      investmentType: data.investmentType || '국내주식',
      market: data.market || 'KR',
      assetName: data.assetName || '',
      symbol: data.symbol || '',
      avgBuyPrice: data.avgBuyPrice || '',
      soldQuantity: data.quantity || '',
      sellPrice: data.currentPrice || '',
      feeTax: '',
      memo: data.assetName ? `${data.assetName} 매도 기록` : '매도 기록',
    });
  }

  return (
    <section className="investment-record-sections">
      {groups.map((group) => (
        <div className="investment-record-section" key={group.id}>
          <header>
            <h2>{group.title}</h2>
            <span>{grouped[group.id].length}개</span>
          </header>
          <div className="record-list investment-record-list">
            {grouped[group.id].map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                onOpen={onOpenRecord}
                onEdit={onEdit}
                onDelete={onDelete}
                onInvestmentSell={group.id === 'holding' ? openSellRecord : undefined}
              />
            ))}
            {grouped[group.id].length === 0 && <p className="empty-text compact-empty">{group.empty}</p>}
          </div>
        </div>
      ))}
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

function KpassSummary({ records }) {
  const summary = records.reduce(
    (total, record) => {
      const kpass = calcKpass(record.data || {});
      total.chargeAmount += kpass.chargeAmount;
      total.refundAmount += kpass.refundAmount;
      total.netCost += kpass.netCost;
      return total;
    },
    { chargeAmount: 0, refundAmount: 0, netCost: 0 },
  );
  const averageRate = summary.chargeAmount > 0 ? ((summary.refundAmount / summary.chargeAmount) * 100).toFixed(1) : '0.0';

  return (
    <section className="category-summary-strip kpass-summary-strip">
      <div>
        <span>총 충전</span>
        <strong>{formatMoney(summary.chargeAmount)}</strong>
      </div>
      <div>
        <span>총 환급</span>
        <strong>{formatMoney(summary.refundAmount)}</strong>
      </div>
      <div>
        <span>총 순비용</span>
        <strong>{formatMoney(summary.netCost)}</strong>
      </div>
      <div>
        <span>평균 환급률</span>
        <strong>{averageRate}%</strong>
      </div>
    </section>
  );
}

function AnnualLeaveSummary({ records }) {
  const year = new Date().getFullYear();
  const leave = calcAnnualLeave(records, year);
  const remainLabel = Number.isInteger(leave.remainDays) ? leave.remainDays : leave.remainDays.toFixed(1);
  const grantLabel = Number.isInteger(leave.grantDays) ? leave.grantDays : leave.grantDays.toFixed(1);
  const usedLabel = Number.isInteger(leave.usedDays) ? leave.usedDays : leave.usedDays.toFixed(1);
  const remainingRate = leave.grantDays > 0 ? Math.max(0, Math.min(100, 100 - leave.usedRate)) : 0;

  return (
    <section className="annual-leave-panel">
      <div className="annual-leave-head">
        <span>{year}년 연차 현황</span>
        <strong>잔여 {remainLabel}일</strong>
      </div>
      <div className="annual-leave-meta">
        <span>부여 {grantLabel}일 / 사용 {usedLabel}일</span>
        <span>{remainingRate.toFixed(0)}%</span>
      </div>
      <div className="annual-leave-progress" aria-label={`잔여 연차 ${remainingRate.toFixed(0)}%`}>
        <span style={{ width: `${remainingRate}%` }} />
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
  const isKpass = categoryId === 'kpass';
  const isAnnualLeave = categoryId === 'annual_leave';
  const displayRecords = isAnnualLeave
    ? [...categoryRecords].sort((a, b) => {
      const aGrant = a.data?.recordType === 'grant' ? 1 : 0;
      const bGrant = b.data?.recordType === 'grant' ? 1 : 0;
      if (aGrant !== bGrant) return bGrant - aGrant;
      return `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`);
    })
    : categoryRecords;
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
      {isKpass && <KpassSummary records={categoryRecords} />}
      {isAnnualLeave && <AnnualLeaveSummary records={categoryRecords} />}
      {!isInvestment && !isKpass && !isAnnualLeave && <CategorySummary records={categoryRecords} />}

      {isInvestment ? (
        <InvestmentRecordSections
          records={categoryRecords}
          onOpenRecord={onOpenRecord}
          onEdit={onEdit}
          onDelete={onDelete}
          onAdd={onAdd}
        />
      ) : (
        <section className="record-list">
          {displayRecords.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {categoryRecords.length === 0 && <p className="empty-text">이 카테고리에 기록이 없습니다.</p>}
        </section>
      )}

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
