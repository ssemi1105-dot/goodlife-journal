import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_MAP, getCategoryThemeStyle } from '../data/categoryDefinitions';
import { buildInvestmentLedger, calcAnnualLeave, formatMoney, getInvestmentRecordType, toNumber } from '../utils/recordUtils';
import { fetchKisPrice } from '../services/kisApiClient';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';
import InvestmentMoodImage from './ui/InvestmentMoodImage';
import { KpassMonthlyList, KpassSummary } from './KpassRecords';
import AnnualLeaveGrid from './AnnualLeaveGrid';
import CategoryRecordSummary from './CategoryRecordSummary';
import TcxImportPanel from './TcxImportPanel';
import { WorkoutMonthlyList } from './WorkoutRecords';

function InvestmentPortfolio({ records, onPriceUpdate, paused = false }) {
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshMessage, setRefreshMessage] = useState('자동 갱신 대기 중');
  const refreshRunningRef = useRef(false);
  const recordsRef = useRef(records);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    recordsRef.current = records;
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onPriceUpdate, records]);

  const ledger = buildInvestmentLedger(records);
  const summary = ledger.positions.reduce(
    (total, record) => {
      total.buyTotal += record.buyTotal;
      total.currentTotal += record.currentTotal;
      return total;
    },
    { buyTotal: 0, currentTotal: 0 },
  );
  const profit = summary.currentTotal - summary.buyTotal;
  const rate = summary.buyTotal > 0 ? (profit / summary.buyTotal) * 100 : 0;
  const profitClass = profit >= 0 ? 'profit-plus' : 'profit-minus';
  const hasQuoteValue = (value) => value !== null && value !== undefined && value !== '';

  const handleRefresh = useCallback(async ({ silent = false } = {}) => {
    if (refreshRunningRef.current || pausedRef.current || document.hidden) return;
    const updatePrice = onPriceUpdateRef.current;
    const currentRecords = recordsRef.current;

    if (!updatePrice) {
      setRefreshMessage('현재가 저장 함수가 연결되지 않았습니다.');
      return;
    }

    const investmentRecords = currentRecords.filter((record) => record.data?.symbol && getInvestmentRecordType(record.data || {}) !== 'sell');
    if (investmentRecords.length === 0) {
      setRefreshMessage('종목코드가 입력된 항목이 없습니다.');
      return;
    }
    const quoteGroups = [...investmentRecords.reduce((groups, record) => {
      const key = `${record.data?.market || 'KR'}:${String(record.data?.symbol || '').trim().toUpperCase()}`;
      groups.set(key, [...(groups.get(key) || []), record]);
      return groups;
    }, new Map()).values()];

    refreshRunningRef.current = true;
    setLoading(true);
    if (!silent) setRefreshMessage('현재가 조회 중...');
    let successCount = 0;
    const failedSymbols = [];

    try {
      for (const groupRecords of quoteGroups) {
        const seedRecord = groupRecords[0];
        const { symbol, market } = seedRecord.data;
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

          for (const record of groupRecords) {
            if (pausedRef.current || document.hidden) return;
            const recordType = getInvestmentRecordType(record.data || {});
            const safeQuantity = toNumber(record.data?.quantity);
            const buyAmount = recordType === 'buy' ? toNumber(record.data?.avgBuyPrice) * safeQuantity : 0;
            const currentAmount = recordType === 'buy' ? currentPrice * safeQuantity : 0;
            const profitLoss = currentAmount - buyAmount;
            const profitLossRate = buyAmount > 0 ? (profitLoss / buyAmount) * 100 : 0;
            const previousPrice = toNumber(record.data?.currentPrice);
            const quoteChanged = Object.entries(quotePatch)
              .filter(([key]) => key !== 'priceFetchedAt')
              .some(([key, value]) => record.data?.[key] !== value);
            if (previousPrice !== currentPrice || toNumber(record.data?.currentAmount) !== currentAmount || quoteChanged) {
              await updatePrice(record.id, {
                ...quotePatch,
                ...(recordType === 'buy' ? { currentAmount, profitLoss, profitLossRate } : {}),
              });
            }
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
        setRefreshMessage(`${successCount}개 종목 확인, ${failedSymbols.length}개 실패`);
      } else {
        setRefreshMessage(`${successCount}개 종목 자동 갱신 완료`);
      }
    } finally {
      setLoading(false);
      refreshRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    handleRefresh({ silent: true });
    const timer = window.setInterval(() => {
      handleRefresh({ silent: true });
    }, 5000);

    return () => {
      pausedRef.current = true;
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
            <strong>{ledger.positions.length}개</strong>
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

function InvestmentPositionCard({ position, onSell }) {
  const profitClass = position.profit >= 0 ? 'profit-plus' : 'profit-minus';
  return (
    <article className="investment-position-card">
      <div className="investment-position-main">
        <div>
          <strong>{position.assetName}</strong>
          <span>{position.symbol || position.market} · 잔여 {position.quantity.toLocaleString('ko-KR')}주</span>
        </div>
        <button type="button" className="secondary-button compact" onClick={() => onSell(position)}>매도</button>
      </div>
      <div className="investment-position-values">
        <div><span>평균단가</span><strong>{formatMoney(position.avgBuyPrice)}</strong></div>
        <div><span>현재가</span><strong>{formatMoney(position.currentPrice)}</strong></div>
        <div><span>평가금액</span><strong>{formatMoney(position.currentTotal)}</strong></div>
        <div><span>평가손익</span><strong className={profitClass}>{position.rate >= 0 ? '+' : ''}{position.rate.toFixed(2)}%</strong></div>
      </div>
    </article>
  );
}

function InvestmentRecordSections({ records, onOpenRecord, onEdit, onDelete, onAdd }) {
  const ledger = buildInvestmentLedger(records);

  function openSellRecord(position) {
    const sellDate = todayLocalIso();
    onAdd('investment', {
      date: sellDate,
      sellDate,
      recordType: 'sell',
      investmentType: position.investmentType || '국내주식',
      market: position.market || 'KR',
      assetName: position.assetName || '',
      symbol: position.symbol || '',
      avgBuyPrice: position.avgBuyPrice || '',
      soldQuantity: position.quantity || '',
      sellPrice: position.currentPrice || '',
      feeTax: '',
      availableQuantity: position.quantity,
      memo: position.assetName ? `${position.assetName} 매도 기록` : '매도 기록',
    });
  }

  return (
    <section className="investment-record-sections">
      <div className="investment-record-section">
        <header><h2>보유종목</h2><span>{ledger.positions.length}개</span></header>
        <div className="record-list investment-position-list">
          {ledger.positions.map((position) => (
            <InvestmentPositionCard key={position.key} position={position} onSell={openSellRecord} />
          ))}
          {ledger.positions.length === 0 && <p className="empty-text compact-empty">보유 중인 종목이 없습니다.</p>}
        </div>
      </div>

      <div className="investment-record-section">
        <header><h2>관심종목</h2><span>{ledger.watchRecords.length}개</span></header>
        <div className="record-list investment-record-list">
          {ledger.watchRecords.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} showCategory={false} />
          ))}
          {ledger.watchRecords.length === 0 && <p className="empty-text compact-empty">추적 중인 관심종목이 없습니다.</p>}
        </div>
      </div>

      <div className="investment-record-section">
        <header><h2>거래내역</h2><span>{ledger.transactions.length}개</span></header>
        <div className="record-list investment-record-list">
          {ledger.transactions.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} showCategory={false} />
          ))}
          {ledger.transactions.length === 0 && <p className="empty-text compact-empty">매수·매도 기록이 없습니다.</p>}
        </div>
      </div>
    </section>
  );
}

const BODY_METRICS = [
  { id: 'bodyWeight', label: '체중', unit: 'kg', color: '#0f766e' },
  { id: 'armCm', label: '팔', unit: 'cm', color: '#2563eb' },
  { id: 'waistCm', label: '허리', unit: 'cm', color: '#dc2626' },
  { id: 'thighCm', label: '허벅지', unit: 'cm', color: '#7c3aed' },
  { id: 'calfCm', label: '종아리', unit: 'cm', color: '#ca8a04' },
];

function formatBodyValue(value, unit) {
  const number = toNumber(value);
  if (!number) return '-';
  return `${Number.isInteger(number) ? number : number.toFixed(1)}${unit}`;
}

function BodyMetricChart({ metric, points }) {
  const values = points
    .map((point) => ({ ...point, value: toNumber(point.data?.[metric.id]) }))
    .filter((point) => point.value > 0);
  const latest = values[values.length - 1];
  const first = values[0];
  const trend = latest && first ? latest.value - first.value : 0;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = Math.max(0.1, max - min);
  const padding = Math.max(range * 0.12, metric.id === 'bodyWeight' ? 0.4 : 0.2);
  const minScale = min - padding;
  const maxScale = max + padding;
  const width = 260;
  const height = 86;
  const xFor = (index) => values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
  const yFor = (value) => height - ((value - minScale) / (maxScale - minScale)) * height;
  const path = values
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point.value).toFixed(1)}`)
    .join(' ');

  return (
    <article className="body-metric-card">
      <header>
        <span>{metric.label}</span>
        <strong>{latest ? formatBodyValue(latest.value, metric.unit) : '-'}</strong>
      </header>
      <div className="body-chart-frame">
        {values.length > 0 ? (
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} 변화 그래프`}>
            <path className="body-chart-grid" d={`M 0 ${height / 2} H ${width}`} />
            {values.length > 1 && <path className="body-chart-line" d={path} style={{ stroke: metric.color }} />}
            {values.map((point, index) => (
              <circle
                key={`${metric.id}-${point.id || point.occurred_on}-${index}`}
                cx={xFor(index)}
                cy={yFor(point.value)}
                r={values.length === 1 ? 4.5 : 3}
                style={{ fill: metric.color }}
              />
            ))}
          </svg>
        ) : (
          <p>기록 없음</p>
        )}
      </div>
      <footer>
        <span>{values.length > 0 ? `${values.length}회 기록` : '기록 대기'}</span>
        {values.length > 1 && (
          <strong className={trend <= 0 ? 'is-down' : 'is-up'}>
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}{metric.unit}
          </strong>
        )}
      </footer>
    </article>
  );
}

function BodyManagementSummary({ records }) {
  const points = [...records]
    .filter((record) => record.data?.bodyWeight || record.data?.armCm || record.data?.waistCm || record.data?.thighCm || record.data?.calfCm)
    .sort((a, b) => `${a.occurred_on}${a.created_at}`.localeCompare(`${b.occurred_on}${b.created_at}`));
  const latest = points[points.length - 1]?.data || {};

  return (
    <section className="body-management-panel">
      <header>
        <div>
          <p className="eyebrow">Body log</p>
          <h2>체중관리 변화</h2>
        </div>
        <strong>{formatBodyValue(latest.bodyWeight, 'kg')}</strong>
      </header>
      <div className="body-latest-grid">
        {BODY_METRICS.map((metric) => (
          <div key={metric.id}>
            <span>{metric.label}</span>
            <strong>{formatBodyValue(latest[metric.id], metric.unit)}</strong>
          </div>
        ))}
      </div>
      <div className="body-chart-grid-list">
        {BODY_METRICS.map((metric) => (
          <BodyMetricChart key={metric.id} metric={metric} points={points} />
        ))}
      </div>
    </section>
  );
}

function AnnualLeaveSummary({ records, onAdd, onEdit }) {
  const year = new Date().getFullYear();
  const leave = calcAnnualLeave(records, year);
  const grantRecord = records
    .filter((record) => record.data?.recordType === 'grant' && String(record.data?.year) === String(year))
    .sort((a, b) => `${b.updated_at || ''}${b.created_at || ''}`.localeCompare(`${a.updated_at || ''}${a.created_at || ''}`))[0];
  const remainLabel = Number.isInteger(leave.remainDays) ? leave.remainDays : leave.remainDays.toFixed(1);
  const grantLabel = Number.isInteger(leave.grantDays) ? leave.grantDays : leave.grantDays.toFixed(1);
  const usedLabel = Number.isInteger(leave.usedDays) ? leave.usedDays : leave.usedDays.toFixed(1);
  const usedRate = Math.max(0, leave.usedRate);
  const filledRate = Math.min(100, usedRate);

  return (
    <section className="annual-leave-panel">
      <div className="annual-leave-head">
        <span>{year}년 연차 현황</span>
        <button
          type="button"
          className="secondary-button compact"
          onClick={(event) => {
            if (grantRecord) onEdit(grantRecord);
            else onAdd('annual_leave', { recordType: 'grant', year: String(year), grantDays: '' }, event.currentTarget);
          }}
        >
          {grantRecord ? '부여 갱신' : '연차 부여'}
        </button>
      </div>
      <dl className="annual-leave-stats">
        <div><dt>부여</dt><dd>{grantLabel}<small>일</small></dd></div>
        <div><dt>사용</dt><dd>{usedLabel}<small>일</small></dd></div>
        <div><dt>잔여</dt><dd>{remainLabel}<small>일</small></dd></div>
      </dl>
      <div className="annual-leave-meta">
        <span>연차 사용률</span>
        <strong>{usedRate.toFixed(0)}%</strong>
      </div>
      <div className="annual-leave-progress" role="progressbar" aria-label="연차 사용률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={filledRate} aria-valuetext={`${usedRate.toFixed(0)}%`}>
        <span style={{ width: `${filledRate}%` }} />
      </div>
    </section>
  );
}

export default function CategoryView({ categoryId, records, onBack, onAdd, onOpenRecord, onOpenKpassMonth, onOpenWorkoutMonth, onEdit, onDelete, onUpdateRecord, onImportWorkout, quotesPaused = false }) {
  const category = CATEGORY_MAP[categoryId];
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState({ query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' });
  const categoryRecords = records.filter((record) => record.category_id === categoryId);
  const isInvestment = categoryId === 'investment';
  const isKpass = categoryId === 'kpass';
  const isAnnualLeave = categoryId === 'annual_leave';
  const isBodyManagement = categoryId === 'exercise';
  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  return (
    <main className="screen category-screen" data-transition-surface="category-surface" style={{ viewTransitionName: 'category-surface' }}>
      <header className="sub-header mobile-sub-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로">←</button>
        <div className="tile-icon" style={getCategoryThemeStyle(category.id)}>{CATEGORY_ICONS[category.id]}</div>
        <div className="sub-header-title">
          <p className="eyebrow">Category</p>
          <h1>{category.label}</h1>
        </div>
        <button type="button" className={hasSearch ? 'search-icon-button is-active' : 'search-icon-button'} onClick={() => setShowSearch(true)} aria-label="검색">🔍</button>
        <button className="primary-button compact" onClick={(event) => onAdd(categoryId, null, event.currentTarget)}>추가</button>
      </header>

      {isInvestment && <InvestmentPortfolio records={categoryRecords} onPriceUpdate={onUpdateRecord} paused={quotesPaused} />}
      {isKpass && <KpassSummary records={categoryRecords} />}
      {isAnnualLeave && <AnnualLeaveSummary records={categoryRecords} onAdd={onAdd} onEdit={onEdit} />}
      {isBodyManagement && <BodyManagementSummary records={categoryRecords} />}
      {!isInvestment && !isKpass && !isAnnualLeave && !isBodyManagement && <CategoryRecordSummary categoryId={categoryId} records={categoryRecords} />}
      {categoryId === 'workout' && <TcxImportPanel onImport={onImportWorkout} />}

      {isInvestment ? (
        <InvestmentRecordSections
          records={categoryRecords}
          onOpenRecord={onOpenRecord}
          onEdit={onEdit}
          onDelete={onDelete}
          onAdd={onAdd}
        />
      ) : isKpass ? (
        <KpassMonthlyList records={categoryRecords} onOpenMonth={onOpenKpassMonth} />
      ) : categoryId === 'workout' ? (
        <WorkoutMonthlyList records={categoryRecords} onOpenMonth={onOpenWorkoutMonth} />
      ) : isAnnualLeave ? (
        <AnnualLeaveGrid records={categoryRecords} onOpenRecord={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        <section className="record-list">
          {categoryRecords.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} showCategory={false} />
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
