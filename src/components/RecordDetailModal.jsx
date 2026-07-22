import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { formatMoney, formatPeriod, getRecordTitle, toNumber } from '../utils/recordUtils';
import VideoFriendReactions from './VideoFriendReactions';
import RecordImagePreview from './ui/RecordImagePreview';

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
    if (value.title || value.tmdbTitle) return value.title || value.tmdbTitle;
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
  const extraPhotoUrls = Array.isArray(data.photos) ? data.photos.map((photo) => photo.signedUrl).filter(Boolean).slice(1) : [];
  const showWeather = record.category_id !== 'investment' && record.category_id !== 'video' && record.category_id !== 'exercise';

  return (
    <div className="modal-backdrop navigation-backdrop">
      <section className="detail-modal navigation-detail-panel">
        <header className="modal-header">
          <div>
            <p className="eyebrow">{CATEGORY_ICONS[record.category_id]} {category?.label}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <RecordImagePreview record={record} large />
        {extraPhotoUrls.length > 0 && (
          <div className="detail-photo-grid">
            {extraPhotoUrls.map((url) => <img src={url} alt="" key={url} />)}
          </div>
        )}

        <div className="detail-meta-row">
          <span>{formatPeriod(data) || record.occurred_on}</span>
          {toNumber(record.rating) > 0 && <span>평점 {Number(record.rating).toFixed(1)}</span>}
          {toNumber(record.amount) > 0 && <span>{formatMoney(record.amount)}</span>}
          {toNumber(record.income_amount) > 0 && <span className="income-text">수입 {formatMoney(record.income_amount)}</span>}
          {showWeather && record.weather_label && (
            <span>
              {record.weather_label}
              {record.temperature_max !== null && record.temperature_max !== undefined ? ` · 최고 ${record.temperature_max}°C` : ''}
              {record.temperature_min !== null && record.temperature_min !== undefined ? ` / 최저 ${record.temperature_min}°C` : ''}
            </span>
          )}
        </div>

        <div className="detail-fields">
          {fields.map((field) => {
            if (['photo', 'photos', 'date'].includes(field.id)) return null;
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

        <VideoFriendReactions record={record} />

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => onEdit(record)}>수정</button>
          <button type="button" className="secondary-button danger" onClick={() => onDelete(record)}>삭제</button>
        </footer>
      </section>
    </div>
  );
}
