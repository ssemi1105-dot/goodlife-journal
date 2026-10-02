import { formatMoney, getMenuPreview, getRecordTitle } from '../utils/recordUtils';
import RecordImagePreview, { getRecordImageUrl } from './ui/RecordImagePreview';
import RatingPreview from './ui/RatingPreview';
import RecordCardHeader from './RecordCardHeader';
import { presentRecord } from '../utils/recordPresentation';

export default function CompactRecordContent({ record, actions, showCategory = true }) {
  const data = record.data || {};
  const isVideo = record.category_id === 'video';
  const hasPhoto = Boolean(getRecordImageUrl(record));
  const titleData = isVideo && !data.title && data.tmdbTitle ? { ...data, title: data.tmdbTitle } : data;
  const title = getRecordTitle(record.category_id, titleData);
  const menu = getMenuPreview(data);
  const rating = record.rating ?? data.rating;
  const hasRating = rating !== null && rating !== undefined && rating !== '';
  const hasAmount = record.amount !== null && record.amount !== undefined && record.amount !== '';
  const genres = Array.isArray(data.detailGenres) ? data.detailGenres : Array.isArray(data.title?.genres) ? data.title.genres : [];
  const note = (isVideo ? [data.memo || data.review, ...genres] : [data.memo]).filter((value) => typeof value === 'string' && value.trim()).join(' · ');
  const status = [data.watchStatus, data.episodeStart && data.episodeEnd ? `${data.episodeStart}~${data.episodeEnd}화` : ''].filter(Boolean).join(' · ');
  const mealInfo = !isVideo && record.category_id !== 'workMeal' ? presentRecord(record).details.join(' · ') : '';

  return (
    <div className={`compact-record-content ${isVideo ? 'is-video' : 'is-meal'}${hasPhoto ? ' has-photo' : ''}${mealInfo ? ' has-meal-info' : ''}${!hasRating && !note ? ' no-reaction' : ''}`}>
      <RecordImagePreview record={record} />
      <div className="compact-record-body">
        <RecordCardHeader record={record} actions={actions} showCategory={showCategory} />
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
        {mealInfo && <div className="record-meal-info" title={mealInfo}>{mealInfo}</div>}
        {!isVideo && hasPhoto && (hasRating || note) ? (
          <>
            <div className="compact-record-rating-row"><RatingPreview value={rating} /></div>
            <p className="compact-record-memo" title={note}>{note}</p>
          </>
        ) : (hasRating || note) && (
          <div className={`compact-record-reaction${hasRating ? ' has-rating' : ''}`}>
            <RatingPreview value={rating} />
            <p className="compact-record-memo" title={note}>{note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
