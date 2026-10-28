import { presentRecord, getRecordPeriod } from '../utils/recordPresentation';
import { getMenuPreview } from '../utils/recordUtils';
import { CATEGORY_MAP } from '../data/categoryDefinitions';
import RecordImagePreview, { getRecordImageUrl } from './ui/RecordImagePreview';
import RatingPreview from './ui/RatingPreview';
import CategoryIcon from './ui/CategoryIcon';

export default function RecentRecordContent({ record, actions }) {
  const info = presentRecord(record);
  const menu = getMenuPreview(record.data || {});
  const subtitle = menu.label || info.details.join(' · ') || info.note;
  return <div className="journal-recent-row">
    {getRecordImageUrl(record) ? <RecordImagePreview record={record} /> : <CategoryIcon categoryId={record.category_id} />}
    <div className="journal-recent-copy"><small>{CATEGORY_MAP[record.category_id]?.label || '기록'} · {getRecordPeriod(record)}</small><strong>{info.title}</strong>{subtitle && <span title={subtitle}>{subtitle}</span>}</div>
    <div className="journal-recent-end">{info.primary ? <strong className={info.primary.tone}>{info.primary.value}</strong> : <RatingPreview value={record.rating ?? record.data?.rating} />}{actions}</div>
  </div>;
}
