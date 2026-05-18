import { CATEGORY_ICONS, CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, calcKpass, calcLineItemAmount, formatMoney, formatPeriod, getRecordTitle, toNumber } from '../utils/recordUtils';
import InvestmentMoodImage from './ui/InvestmentMoodImage';
import RecordImagePreview from './ui/RecordImagePreview';

export default function RecordCard({ record, onOpen, onEdit, onDelete }) {
  const category = CATEGORY_MAP[record.category_id];
  const data = record.data || {};
  const title = getRecordTitle(record.category_id, data);
  const investment = record.category_id === 'investment' ? calcInvestment(data) : null;
  const kpass = record.category_id === 'kpass' ? calcKpass(data) : null;
  const period = formatPeriod(data) || record.occurred_on;
  const shoppingItems = record.category_id === 'shopping'
    ? (Array.isArray(data.productItems) ? data.productItems : data.items || []).filter((item) => item?.name)
    : [];
  const visibleShoppingItems = shoppingItems.slice(0, 10);

  return (
    <article className={record.category_id === 'investment' ? 'record-card is-investment-record' : 'record-card'} role="button" tabIndex={0} onClick={() => onOpen?.(record)} onKeyDown={(event) => {
      if (event.key === 'Enter') onOpen?.(record);
    }}>
      <RecordImagePreview record={record} />
      <div className="record-body">
        <div className="record-topline">
          <span style={{ color: category?.color }}>{CATEGORY_ICONS[record.category_id]} {category?.label || record.category_id}</span>
          <time>
            {period}
            {record.weather_label && (
              <em>
                {record.weather_label}
                {record.temperature_max !== null && record.temperature_max !== undefined ? ` · 최고 ${record.temperature_max}°C` : ''}
              </em>
            )}
          </time>
        </div>
        <h3>{title}</h3>
        {visibleShoppingItems.length > 0 && (
          <ul className="shopping-item-preview" aria-label="쇼핑 구매 내역 미리보기">
            {visibleShoppingItems.map((item, index) => {
              const amount = calcLineItemAmount(item);
              return (
                <li key={`${item.name}-${index}`}>
                  <span>{item.name}</span>
                  {amount > 0 && <strong>{formatMoney(amount)}</strong>}
                </li>
              );
            })}
            {shoppingItems.length > visibleShoppingItems.length && (
              <li className="is-more">
                <span>...</span>
                <strong>외 {shoppingItems.length - visibleShoppingItems.length}개</strong>
              </li>
            )}
          </ul>
        )}
        {record.category_id === 'video' && (data.detailGenres?.length > 0 || data.title?.genres?.length > 0) && (
          <div className="genre-pills compact-pills">
            {(data.detailGenres || data.title?.genres || []).map((genre) => <em key={genre}>{genre}</em>)}
          </div>
        )}
        <div className="record-meta">
          {toNumber(record.amount) > 0 && record.category_id !== 'kpass' && <span>{formatMoney(record.amount)}</span>}
          {toNumber(record.income_amount) > 0 && <span className="income-text">수입 {formatMoney(record.income_amount)}</span>}
          {toNumber(record.rating) > 0 && <span>평점 {record.rating}</span>}
          {record.category_id === 'kpass' && (
            <>
              <span>순비용 {formatMoney(kpass.netCost)}</span>
              <span>충전 {formatMoney(kpass.chargeAmount)}</span>
              <span>환급 {formatMoney(kpass.refundAmount)}</span>
              <span>환급률 {kpass.refundRate}%</span>
            </>
          )}
          {record.category_id === 'annual_leave' && data.recordType === 'grant' && <span>부여 {toNumber(data.grantDays)}일</span>}
          {record.category_id === 'annual_leave' && data.recordType === 'use' && <span>사용 {toNumber(data.days)}일</span>}
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
