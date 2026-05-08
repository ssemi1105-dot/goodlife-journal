import { filterRecords } from '../utils/recordUtils';
import RecordCard from './RecordCard';

const EMPTY_FILTERS = { query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' };

export default function SearchModal({
  title = '검색',
  records,
  filters,
  onFiltersChange,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}) {
  const results = filterRecords(records, filters);

  function setFilter(key, value) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <div className="modal-backdrop">
      <section className="search-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Search</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="search-form">
          <input autoFocus value={filters.query || ''} onChange={(event) => setFilter('query', event.target.value)} placeholder="검색어" />
          <div className="mobile-filter-grid">
            <input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilter('dateFrom', event.target.value)} />
            <input type="date" value={filters.dateTo || ''} onChange={(event) => setFilter('dateTo', event.target.value)} />
            <input type="number" value={filters.minAmount || ''} onChange={(event) => setFilter('minAmount', event.target.value)} placeholder="최소 금액" />
            <input type="number" value={filters.maxAmount || ''} onChange={(event) => setFilter('maxAmount', event.target.value)} placeholder="최대 금액" />
          </div>
          <select value={filters.minRating || ''} onChange={(event) => setFilter('minRating', event.target.value)}>
            <option value="">평점 전체</option>
            <option value="1">1점 이상</option>
            <option value="2">2점 이상</option>
            <option value="3">3점 이상</option>
            <option value="4">4점 이상</option>
            <option value="5">5점</option>
          </select>
          <button type="button" className="secondary-button" onClick={() => onFiltersChange(EMPTY_FILTERS)}>초기화</button>
        </div>

        <div className="section-title search-result-title">
          <h2>결과</h2>
          <span>{results.length}개</span>
        </div>
        <div className="record-list modal-record-list">
          {results.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {results.length === 0 && <p className="empty-text">조건에 맞는 기록이 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}
