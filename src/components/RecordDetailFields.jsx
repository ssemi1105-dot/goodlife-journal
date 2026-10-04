import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcLineItemAmount, formatMoney, getInvestmentRecordType, toNumber } from '../utils/recordUtils';
import { displayText, getDisplayData, hasValue, isEnabled, numberText } from '../utils/recordPresentation';
import RatingPreview from './ui/RatingPreview';
import { workoutDuration, workoutPace, workoutTimestamp } from '../utils/workoutSummary';

const UNITS = { interestRate: '%', refundRate: '%', profitLossRate: '%', realizedProfitRate: '%', quantity: '주', soldQuantity: '주', catchCount: '마리', weight: 'kg', bodyWeight: 'kg', armCm: 'cm', waistCm: 'cm', thighCm: 'cm', calfCm: 'cm', odometerKm: 'km', nextServiceKm: 'km', days: '일', grantDays: '일', peopleCount: '명' };

export function formatLocalAmount(value, currency) {
  const unit = String(currency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(unit)) {
    try { return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: unit, currencyDisplay: 'code' }).format(toNumber(value)); } catch { /* Preserve an unrecognized unit as text. */ }
  }
  return `${numberText(value)} ${unit || '(통화 미지정)'}`;
}

function visibleField(record, field, data) {
  if (['date', 'photo', 'photos', 'rating'].includes(field.id) || field.type === 'dateRange') return false;
  const titleField = CATEGORY_MAP[record.category_id]?.titleField;
  if (field.id === titleField && field.type !== 'lineItems' && field.type !== 'textarea') return false;
  const amountField = CATEGORY_MAP[record.category_id]?.amountField;
  if (field.id === amountField && field.type === 'money' && record.category_id !== 'fishing') return false;
  if (record.category_id === 'savings' && field.id === 'monthlyAmount') return false;
  if (record.category_id === 'salary' && field.id === 'netAmount' && !isEnabled(data.bonus)) return false;
  if (field.id === 'peopleCount' && data.payRelation !== '더치페이') return false;
  if (field.id === 'bonusAmount' && !isEnabled(data.bonus)) return false;
  if (record.category_id === 'investment') {
    const type = getInvestmentRecordType(data);
    const buyFields = ['avgBuyPrice', 'quantity', 'buyAmount', 'currentAmount', 'profitLoss', 'profitLossRate'];
    const sellFields = ['sellDate', 'soldQuantity', 'sellPrice', 'feeTax', 'sellAmount', 'realizedProfit', 'realizedProfitRate'];
    if (type === 'watch' && [...buyFields, ...sellFields].includes(field.id)) return false;
    if (type !== 'sell' && sellFields.includes(field.id)) return false;
    if (type === 'sell' && ['quantity', 'currentPrice', 'currentAmount', 'profitLoss', 'profitLossRate'].includes(field.id)) return false;
    if (type !== 'watch' && field.id === 'targetPrice') return false;
  }
  return true;
}

function DetailValue({ field, value, data }) {
  if (field.id === 'durationSeconds') return workoutDuration(value);
  if (field.id === 'distanceMeters') return `${numberText(toNumber(value) / 1000)}km`;
  if (['startedAt', 'endedAt'].includes(field.id)) return workoutTimestamp(value);
  if (field.id === 'averagePaceSeconds') return workoutPace(value);
  if (['averageHeartRate', 'maxHeartRate'].includes(field.id)) return `${numberText(value)}bpm`;
  if (field.id === 'caloriesKcal') return `${numberText(value)}kcal`;
  if (field.id === 'averageSpeedKmh') return `${numberText(value)}km/h`;
  if (field.type === 'lineItems') {
    const items = Array.isArray(value) ? value.filter(Boolean) : [];
    if (!items.length) return null;
    return <div className="detail-line-items record-detail-items">
      {items.map((item, index) => {
        const local = field.id === 'localExpenses';
        const amount = calcLineItemAmount(item);
        const priced = hasValue(item.amount) || hasValue(item.price) || hasValue(item.unitPrice);
        return <div key={index}>
          <span>{item.name || '항목'}{hasValue(item.quantity) && <small> × {numberText(item.quantity)}</small>}</span>
          {priced && <strong>{local ? formatLocalAmount(amount, data.currency) : formatMoney(amount)}</strong>}
          {hasValue(item.rating) && <RatingPreview value={item.rating} />}
        </div>;
      })}
    </div>;
  }
  if (field.type === 'boolean') return <span className={`record-status ${isEnabled(value) ? 'active' : 'paused'}`}>{field.id === 'active' ? isEnabled(value) ? '활성' : '비활성' : isEnabled(value) ? '있음' : '없음'}</span>;
  if (field.type === 'money') return formatMoney(value);
  if (field.id === 'billingDay') return `매월 ${value}일`;
  if (field.type === 'number') return `${numberText(value)}${UNITS[field.id] || ''}`;
  const option = field.options?.find((item) => item && typeof item === 'object' && item.value === value);
  if (option) return option.label;
  return displayText(value);
}

export default function RecordDetailFields({ record }) {
  const data = getDisplayData(record);
  return <div className="detail-fields record-detail-grid">
    {(CATEGORY_MAP[record.category_id]?.fields || []).map((field) => {
      const value = data[field.id];
      if (!visibleField(record, field, data) || !hasValue(value) || (Array.isArray(value) && value.length === 0)) return null;
      const wide = ['textarea', 'lineItems', 'tags'].includes(field.type) || ['memo', 'content', 'steps', 'analysis'].includes(field.id);
      return <div className={`record-detail-field${wide ? ' is-wide' : ''}`} key={field.id}>
        <span>{field.id === 'durationSeconds' ? '운동 시간' : field.id === 'distanceMeters' ? '거리' : field.label}</span><div><DetailValue field={field} value={value} data={data} /></div>
      </div>;
    })}
  </div>;
}
