import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, formatMoney, formatPeriod, getRecordTitle, toNumber } from '../utils/recordUtils';
import InvestmentMoodImage from './ui/InvestmentMoodImage';
import RecordImagePreview from './ui/RecordImagePreview';

export default function RecordCard({ record, onOpen, onEdit, onDelete }) {
  const category = CATEGORY_MAP[record.category_id];
  const data = record.data || {};
  const title = getRecordTitle(record.category_id, data);
  const investment = record.category_id === 'investment' ? calcInvestment(data) : null;
  const period = formatPeriod(data) || record.occurred_on;

  return (
    <article className="record-card" role="button" tabIndex={0} onClick={() => onOpen?.(record)} onKeyDown={(event) => {
      if (event.key === 'Enter') onOpen?.(record);
    }}>
      <RecordImagePreview record={record} />
      <div className="record-body">
        <div className="record-topline">
          <span style={{ color: category?.color }}>{CATEGORY_ICONS[record.category_id]} {category?.label || record.category_id}</span>
          <time>{period}</time>
        </div>
        <h3>{title}</h3>
        {record.category_id === 'video' && (data.detailGenres?.length > 0 || data.title?.genres?.length > 0) && (
          <div className="genre-pills compact-pills">
            {(data.detailGenres || data.title?.genres || []).map((genre) => <em key={genre}>{genre}</em>)}
          </div>
        )}
        <div className="record-meta">
          {toNumber(record.amount) > 0 && <span>{formatMoney(record.amount)}</span>}
          {toNumber(record.income_amount) > 0 && <span className="income-text">수입 {formatMoney(record.income_amount)}</span>}
          {toNumber(record.rating) > 0 && <span>평점 {record.rating}</span>}
          {record.category_id === 'subscription' && (
            <span className={data.active ? 'status-badge is-active' : 'status-badge is-paused'}>
              {data.active ? '활성' : '비활성'}
            </span>
          )}
          {data.diningType && <span>{data.diningType}</span>}
          {data.withWhom && <span>{data.withWhom}</span>}
          {data.payRelation && <span>{data.payRelation}</span>}
          {data.deliveryPlatform && <span>{data.deliveryPlatform}</span>}
          {data.ideaCategory && <span>{data.ideaCategory}</span>}
          {data.ideaStatus && <span>{data.ideaStatus}</span>}
          {data.watchStatus && <span>{data.watchStatus}</span>}
          {data.episodeStart && data.episodeEnd && <span>{data.episodeStart}화~{data.episodeEnd}화</span>}
          {record.category_id === 'hospital' && <span>실부담 {formatMoney(data.netMedicalCost || record.amount)}</span>}
        </div>
        {record.category_id === 'investment' && investment.buyTotal > 0 && (
          <div className="investment-card-mood">
            <InvestmentMoodImage rate={investment.rate} compact />
            <p className={investment.profit >= 0 ? 'profit-plus' : 'profit-minus'}>
              수익률 {investment.rate.toFixed(2)}% · {formatMoney(investment.profit)}
            </p>
          </div>
        )}
        {data.memo && <p className="record-memo">{data.memo}</p>}
      </div>
      <div className="record-actions">
        <details className="record-menu" onClick={(event) => event.stopPropagation()}>
          <summary aria-label="기록 메뉴">...</summary>
          <div>
            <button type="button" onClick={() => onEdit(record)}>수정</button>
            <button type="button" className="danger" onClick={() => onDelete(record)}>삭제</button>
          </div>
        </details>
      </div>
    </article>
  );
}
