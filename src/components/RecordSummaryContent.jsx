import { calcLineItemAmount, formatMoney } from '../utils/recordUtils';
import { getDisplayData, hasValue, presentRecord } from '../utils/recordPresentation';
import RecordCardHeader from './RecordCardHeader';
import RecordImagePreview, { getRecordImageUrl } from './ui/RecordImagePreview';
import RatingPreview from './ui/RatingPreview';

export default function RecordSummaryContent({ record, actions, showCategory }) {
  const data = getDisplayData(record);
  const presentation = presentRecord(record);
  const rating = record.rating ?? data.rating;
  const items = record.category_id === 'shopping' && Array.isArray(data.productItems) ? data.productItems.filter((item) => item?.name) : [];
  const hasPhoto = Boolean(getRecordImageUrl(record));
  return (
    <div className="record-display">
      <div className={`record-preview-layout${hasPhoto ? ' has-photo' : ''}`}>
        <RecordImagePreview record={record} />
        <div className="record-preview-body">
          <RecordCardHeader record={record} actions={actions} showCategory={showCategory} />
          <div className="record-preview-main">
            <h3 title={presentation.title}>{presentation.title}</h3>
            {presentation.primary && <div className={`record-primary-value ${presentation.primary.tone}`}>
              <small>{presentation.primary.label}</small><strong>{presentation.primary.value}</strong>
            </div>}
          </div>
          {(presentation.status || presentation.details.length > 0) && <div className="record-preview-info">
            {presentation.status && <span className={`record-status ${presentation.statusTone}`}>{presentation.status}</span>}
            {presentation.details.length > 0 && <span title={presentation.details.join(' · ')}>{presentation.details.join(' · ')}</span>}
          </div>}
          {presentation.metrics.length > 0 && <div className={`record-measures${presentation.metrics.length > 2 ? ' has-four' : ''}`}>
            {presentation.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong className={metric.tone}>{metric.value}</strong></div>)}
          </div>}
          {(hasValue(rating) || presentation.note) && <div className="record-preview-note">
            {hasValue(rating) && <RatingPreview value={rating} />}
            {presentation.note && <p title={presentation.note}>{presentation.note}</p>}
          </div>}
        </div>
      </div>
      {items.length > 0 && <ul className="shopping-item-preview record-items-preview" aria-label="쇼핑 구매 내역 미리보기">
        {items.slice(0, 10).map((item, index) => <li key={index}><span title={item.name}>{item.name}</span>
          {(hasValue(item.amount) || hasValue(item.price) || hasValue(item.unitPrice)) && <strong>{formatMoney(calcLineItemAmount(item))}</strong>}
        </li>)}
        {items.length > 10 && <li className="is-more"><span>...</span><strong>외 {items.length - 10}개</strong></li>}
      </ul>}
    </div>
  );
}
