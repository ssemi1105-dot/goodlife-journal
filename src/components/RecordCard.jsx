import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, formatMoney, getRecordTitle, toNumber } from '../utils/recordUtils';

export default function RecordCard({ record, onOpen, onEdit, onDelete }) {
  const category = CATEGORY_MAP[record.category_id];
  const data = record.data || {};
  const title = getRecordTitle(record.category_id, data);
  const investment = record.category_id === 'investment' ? calcInvestment(data) : null;

  return (
    <article className="record-card" role="button" tabIndex={0} onClick={() => onOpen?.(record)} onKeyDown={(event) => {
      if (event.key === 'Enter') onOpen?.(record);
    }}>
      {record.photoUrl && <img className="record-photo" src={record.photoUrl} alt="" />}
      <div className="record-body">
        <div className="record-topline">
          <span style={{ color: category?.color }}>{CATEGORY_ICONS[record.category_id]} {category?.label || record.category_id}</span>
          <time>{record.occurred_on}</time>
        </div>
        <h3>{title}</h3>
        {record.category_id === 'video' && data.title?.genres?.length > 0 && (
          <div className="genre-pills compact-pills">
            {data.title.genres.map((genre) => <em key={genre}>{genre}</em>)}
          </div>
        )}
        <div className="record-meta">
          {toNumber(record.amount) > 0 && <span>{formatMoney(record.amount)}</span>}
          {toNumber(record.income_amount) > 0 && <span className="income-text">수입 {formatMoney(record.income_amount)}</span>}
          {toNumber(record.rating) > 0 && <span>평점 {record.rating}</span>}
          {data.watchStatus && <span>{data.watchStatus}</span>}
          {data.episodeStart && data.episodeEnd && <span>{data.episodeStart}화~{data.episodeEnd}화</span>}
        </div>
        {record.category_id === 'investment' && investment.buyTotal > 0 && (
          <p className={investment.profit >= 0 ? 'profit-plus' : 'profit-minus'}>
            수익률 {investment.rate.toFixed(2)}% · {formatMoney(investment.profit)}
          </p>
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
