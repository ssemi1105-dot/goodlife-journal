import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { formatPeriod, getRecordTitle, toNumber } from '../utils/recordUtils';
import { getRecordPeriod, getRecordWeather, hasValue, presentRecord } from '../utils/recordPresentation';
import VideoFriendReactions from './VideoFriendReactions';
import RecordDetailFields from './RecordDetailFields';
import RecordImagePreview, { getRecordImageUrl } from './ui/RecordImagePreview';
import RatingPreview from './ui/RatingPreview';

export default function RecordDetailModal({ record, onClose, onEdit, onDelete }) {
  if (!record) return null;
  const category = CATEGORY_MAP[record.category_id];
  const data = record.data || {};
  const isLeave = record.category_id === 'annual_leave';
  const presentation = presentRecord(record);
  const title = isLeave ? getRecordTitle(record.category_id, data) : presentation.title;
  const firstPhoto = getRecordImageUrl(record);
  const photos = [...new Set([...(Array.isArray(record.photoUrls) ? record.photoUrls : []), ...(Array.isArray(data.photos) ? data.photos : []).map((photo) => photo?.signedUrl || photo?.url)].filter((url) => url && url !== firstPhoto))];
  const weather = getRecordWeather(record);
  const rating = record.rating ?? data.rating;

  return (
    <div className="modal-backdrop navigation-backdrop">
      <section className={`detail-modal navigation-detail-panel${isLeave ? '' : ' presented-detail'}`} role="dialog" aria-modal="true" aria-label={`${category?.label || '기록'} 상세`} data-transition-surface="record-surface" style={{ viewTransitionName: 'record-surface' }}>
        <header className="modal-header">
          <div><p className="eyebrow">{CATEGORY_ICONS[record.category_id]} {category?.label}</p><h2>{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        {isLeave ? <>
          <div className="detail-meta-row"><span>{formatPeriod(data) || record.occurred_on}</span>{weather && <span>{weather}</span>}</div>
          <div className="detail-fields">
            {(category?.fields || []).filter((field) => field.id !== 'date' && hasValue(data[field.id])).map((field) => (
              <div className="detail-field" key={field.id}><span>{field.label}</span><div>{String(data[field.id])}</div></div>
            ))}
          </div>
        </> : <>
          <div className={`record-detail-overview${firstPhoto ? ' has-photo' : ''}`}>
            <RecordImagePreview record={record} large />
            <div className="record-detail-overview-text">
              <time>{getRecordPeriod(record)}</time>
              {weather && <span className="record-detail-weather">{weather}</span>}
              {presentation.status && <span className={`record-status ${presentation.statusTone}`}>{presentation.status}</span>}
              {presentation.primary && <div className={`record-detail-primary ${presentation.primary.tone}`}><span>{presentation.primary.label}</span><strong>{presentation.primary.value}</strong></div>}
              {hasValue(rating) && <div className="record-detail-rating"><RatingPreview value={rating} /><span>{toNumber(rating).toFixed(1)} / 5</span></div>}
            </div>
          </div>
          {photos.length > 0 && <div className="detail-photo-grid">
            {photos.map((url) => <RecordImagePreview record={record} large url={url} key={url} />)}
          </div>}
          <RecordDetailFields record={record} />
          <VideoFriendReactions record={record} />
        </>}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => onEdit(record)}>수정</button>
          <button type="button" className="secondary-button danger" onClick={() => onDelete(record)}>삭제</button>
        </footer>
      </section>
    </div>
  );
}
