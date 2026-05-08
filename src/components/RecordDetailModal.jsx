import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { formatMoney, getRecordTitle, toNumber } from '../utils/recordUtils';

function renderValue(value) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  if (value instanceof File) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((item) => item && typeof item === 'object')) {
      return (
        <div className="detail-line-items">
          {value.map((item, index) => (
            <div key={`${item.name || index}-${index}`}>
              <span>{item.name || '항목'}</span>
              <strong>{formatMoney(item.amount)}</strong>
              {toNumber(item.rating) > 0 && <small>평점 {Number(item.rating).toFixed(1)}</small>}
            </div>
          ))}
        </div>
      );
    }
    return value.join(', ');
  }
  if (typeof value === 'object') {
    if (value.title) return value.title;
    return null;
  }
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  return String(value);
}

export default function RecordDetailModal({ record, onClose, onEdit, onDelete }) {
  if (!record) return null;
  const category = CATEGORY_MAP[record.category_id];
  const data = record.data || {};
  const title = getRecordTitle(record.category_id, data);
  const fields = category?.fields || [];
  const imageUrl = record.photoUrl || data.title?.poster || '';

  return (
    <div className="modal-backdrop">
      <section className="detail-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">{CATEGORY_ICONS[record.category_id]} {category?.label}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {imageUrl && <img className="detail-photo" src={imageUrl} alt="" />}

        <div className="detail-meta-row">
          <span>{record.occurred_on}</span>
          {toNumber(record.rating) > 0 && <span>평점 {Number(record.rating).toFixed(1)}</span>}
          {toNumber(record.amount) > 0 && <span>{formatMoney(record.amount)}</span>}
          {toNumber(record.income_amount) > 0 && <span className="income-text">수입 {formatMoney(record.income_amount)}</span>}
        </div>

        <div className="detail-fields">
          {fields.map((field) => {
            if (['photo', 'date'].includes(field.id)) return null;
            const value = renderValue(data[field.id]);
            if (!value) return null;
            return (
              <div className="detail-field" key={field.id}>
                <span>{field.label}</span>
                <div>{value}</div>
              </div>
            );
          })}
        </div>

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => onEdit(record)}>수정</button>
          <button type="button" className="secondary-button danger" onClick={() => onDelete(record)}>삭제</button>
        </footer>
      </section>
    </div>
  );
}
