import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { formatMoney, formatPeriod, getMenuPreview, getRecordTitle } from '../utils/recordUtils';
import RecordImagePreview, { getRecordImageUrl } from './ui/RecordImagePreview';
import RatingPreview from './ui/RatingPreview';

export default function CompactRecordContent({ record, actions }) {
  const data = record.data || {};
  const isVideo = record.category_id === 'video';
  const hasPhoto = Boolean(getRecordImageUrl(record));
  const category = CATEGORY_MAP[record.category_id];
  const titleData = isVideo && !data.title && data.tmdbTitle ? { ...data, title: data.tmdbTitle } : data;
  const title = getRecordTitle(record.category_id, titleData);
  const period = formatPeriod(data) || record.occurred_on || data.date || '';
  const menu = getMenuPreview(data);
  const rating = record.rating ?? data.rating;
  const hasRating = rating !== null && rating !== undefined && rating !== '';
  const hasAmount = record.amount !== null && record.amount !== undefined && record.amount !== '';
  const weather = !isVideo && record.weather_label
    ? `${record.weather_label}${record.temperature_max !== null && record.temperature_max !== undefined ? ` · 최고 ${record.temperature_max}°C` : ''}`
    : '';
  const genres = Array.isArray(data.detailGenres) ? data.detailGenres : Array.isArray(data.title?.genres) ? data.title.genres : [];
  const note = (isVideo ? [data.memo || data.review, ...genres] : [data.memo]).filter((value) => typeof value === 'string' && value.trim()).join(' · ');
  const status = [data.watchStatus, data.episodeStart && data.episodeEnd ? `${data.episodeStart}~${data.episodeEnd}화` : ''].filter(Boolean).join(' · ');

  return (
    <div className={`compact-record-content ${isVideo ? 'is-video' : 'is-meal'}${hasPhoto ? ' has-photo' : ''}`}>
      <RecordImagePreview record={record} />
      <div className="compact-record-body">
        <div className="compact-record-header">
          <div className="compact-record-date-row">
            {(isVideo || !hasPhoto) && <span className="compact-record-category">{category?.label}</span>}
            <time className="compact-record-date" title={period}>{period}</time>
            {weather && <span className="compact-record-weather" title={weather}>{weather}</span>}
          </div>
          {actions}
        </div>
        <div className={`compact-record-main ${menu.label && !isVideo ? 'has-menu' : ''}`}>
          <h3 className="compact-record-title" title={title}>{title}</h3>
          {isVideo ? (
            status && <span className="compact-record-status" title={status}>{status}</span>
          ) : (
            <>
              {menu.label && <span className="compact-record-menu-name" title={menu.fullText} aria-label={`메뉴: ${menu.fullText}`}>{menu.label}</span>}
              {hasAmount && <strong className="compact-record-amount">{formatMoney(record.amount)}</strong>}
            </>
          )}
        </div>
        {!isVideo && hasPhoto ? (
          <>
            <div className="compact-record-rating-row"><RatingPreview value={rating} /></div>
            <p className="compact-record-memo" title={note}>{note}</p>
          </>
        ) : (
          <div className={`compact-record-reaction${hasRating ? ' has-rating' : ''}`}>
            <RatingPreview value={rating} />
            <p className="compact-record-memo" title={note}>{note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
