import { useMemo, useState } from 'react';
import { BookOpen, ChartNoAxesColumnIncreasing, ChevronRight, ExternalLink, Languages, Plus, Repeat2, Search } from 'lucide-react';
import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { APP_VERSION } from '../lib/appVersion';
import { formatMoney, summarizeCategoryTotals, summarizePeriod } from '../utils/recordUtils';
import RecordCard from './RecordCard';
import SearchModal from './SearchModal';
import CategoryIcon from './ui/CategoryIcon';
import { getCategoryNavigation } from '../utils/categoryNavigation';

const PERIODS = [
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'quarter', label: '분기별' },
  { key: 'year', label: '연간' },
];

function FinanceSummaryModal({ period, summary, categoryTotals, onClose }) {
  const [breakdownType, setBreakdownType] = useState('expense');
  const breakdownItems = categoryTotals.filter((item) => item[breakdownType] > 0);
  const breakdownLabel = breakdownType === 'expense' ? '지출' : '수입';

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
          <button type="button" className={breakdownType === 'expense' ? 'is-selected' : ''} onClick={() => setBreakdownType('expense')}>
            <span>지출</span>
            <strong className="expense-text">{formatMoney(summary.expense)}</strong>
          </button>
          <button type="button" className={breakdownType === 'income' ? 'is-selected' : ''} onClick={() => setBreakdownType('income')}>
            <span>수입</span>
            <strong className="income-text">{formatMoney(summary.income)}</strong>
          </button>
        </div>

        <div className="finance-breakdown">
          <h3>카테고리별 {breakdownLabel}</h3>
          {breakdownItems.map((item) => {
            const category = CATEGORY_MAP[item.categoryId];
            return (
              <div key={item.categoryId}>
                <span>{CATEGORY_ICONS[item.categoryId]} {category?.label || item.categoryId}</span>
                <strong className={breakdownType === 'income' ? 'income-text' : 'expense-text'}>
                  {formatMoney(item[breakdownType])}
                </strong>
              </div>
            );
          })}
          {breakdownItems.length === 0 && (
            <p className="empty-text">이 기간의 {breakdownLabel} 기록이 없습니다.</p>
          )}
        </div>
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
  onOpenTutor,
  japaneseTutorUrl,
  onBrowseCategories,
  onManageCategories,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [showFinanceSummary, setShowFinanceSummary] = useState(false);
  const activePeriod = PERIODS[periodIndex];
  const summary = summarizePeriod(records, settings.finance_modes, activePeriod.key);
  const categoryTotals = summarizeCategoryTotals(records, settings.finance_modes, activePeriod.key);

  const navigation = useMemo(() => getCategoryNavigation(records, settings), [records, settings]);

  const hasSearch = Boolean(filters.query || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount || filters.minRating);

  function cyclePeriod() {
    setPeriodIndex((index) => (index + 1) % PERIODS.length);
  }

  return (
    <main className="screen journal-home">
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
          <Search size={22} aria-hidden="true" />
        </button>
      </section>

      <section className="journal-finance">
        <header><h2>나의 기록</h2><button type="button" className="journal-period" onClick={cyclePeriod} aria-label={`집계 기간 ${activePeriod.label}, 다음 기간으로 변경`}>{activePeriod.label}<Repeat2 size={14} /></button></header>
        <button type="button" className="journal-finance-values summary-cycle-button" onClick={cyclePeriod} aria-label={`${activePeriod.label} 지출 ${formatMoney(summary.expense)}, 수입 ${formatMoney(summary.income)}. 다음 기간으로 변경`}>
          <span><small>지출</small><strong className="expense-text">{formatMoney(summary.expense)}</strong></span>
          <span><small>수입</small><strong className="income-text">{formatMoney(summary.income)}</strong></span>
        </button>
        <footer><span>{activePeriod.label} 기록 <strong>{summary.count}건</strong></span><button type="button" aria-label="통계" onClick={() => setShowFinanceSummary(true)}>자세히 보기<ChevronRight size={14} /></button></footer>
      </section>

      <section className="section-block journal-favorites-section">
        <div className="section-title">
          <h2>즐겨찾기</h2>
          <button type="button" className="journal-text-button" onClick={onManageCategories}>편집<ChevronRight size={14} /></button>
        </div>
        <div className="journal-favorites-grid">
          {navigation.favorites.map(({ category }) => (
            <button
              type="button"
              className="journal-favorite-button"
              key={category.id}
              onClick={(event) => onOpenCategory(category.id, event.currentTarget)}
            >
              <CategoryIcon categoryId={category.id} />
              <strong>{category.label}</strong>
            </button>
          ))}
        </div>
        {!navigation.favorites.length && <button type="button" className="journal-empty-favorites" onClick={onManageCategories}><Plus size={18} />즐겨찾기 추가</button>}
      </section>

      <section className="section-block journal-recent-section">
        <div className="section-title">
          <h2>최근 기록</h2>
          <button type="button" className="journal-text-button" onClick={() => setShowSearch(true)}>전체 {records.length}건<ChevronRight size={14} /></button>
        </div>
        <div className="record-list">
          {records.slice(0, 3).map((record) => (
            <RecordCard key={record.id} record={record} homePreview onOpen={onOpenRecord} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {records.length === 0 && <p className="empty-text">아직 기록이 없습니다. 첫 기록을 추가해보세요.</p>}
        </div>
      </section>

      <button type="button" className="journal-frequent-link" onClick={() => onBrowseCategories('frequent')}><ChartNoAxesColumnIncreasing size={23} /><strong>자주 사용한 카테고리 보기</strong><ChevronRight size={17} /></button>

      {(onOpenTutor || japaneseTutorUrl) && <div className="tutor-entry-bar">
        {onOpenTutor && <button type="button" className="tutor-launch-button" onClick={onOpenTutor}><BookOpen size={19} />영어 튜터</button>}
        {japaneseTutorUrl && <a className="tutor-launch-button" href={japaneseTutorUrl} target="_blank" rel="noopener noreferrer" aria-label="일본어 튜터 · 미캉 (새 탭)" title="미캉 일본어 학습 (새 탭)"><Languages size={19} aria-hidden="true" />일본어 튜터<ExternalLink size={13} aria-hidden="true" /></a>}
      </div>}
      <button type="button" className="journal-add-record" onClick={event => onAdd(null, null, event.currentTarget)}><Plus size={18} />기록 추가</button>

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
