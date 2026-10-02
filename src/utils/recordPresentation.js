import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcInvestment, calcKpass, calcSoldInvestment, formatMoney, formatPeriod, getInvestmentRecordType, getKpassRecordDate, getRecordTitle, getSalaryNet, toNumber } from './recordUtils';

export const hasValue = (value) => value !== undefined && value !== null && value !== '';
export const displayText = (value) => Array.isArray(value) ? value.map(displayText).filter(Boolean).join(', ') : value && typeof value === 'object' ? String(value.name || value.title || '') : hasValue(value) ? String(value) : '';
export const numberText = (value) => toNumber(value).toLocaleString('ko-KR', { maximumFractionDigits: 4 });
export const isEnabled = (value) => value === true || value === 'true';
const withUnit = (value, unit) => hasValue(value) ? `${numberText(value)}${unit}` : '';
const signed = (value, formatter = formatMoney) => `${toNumber(value) > 0 ? '+' : ''}${formatter(value)}`;
function displayItems(...sources) {
  for (const source of sources) {
    const items = (Array.isArray(source) ? source : []).filter(Boolean).map((item) => typeof item === 'string' ? { name: item } : item);
    if (items.length) return items;
  }
  return [];
}
const weightText = (value) => !hasValue(value) ? '' : /^\d+(?:\.\d+)?$/.test(String(value).trim()) ? withUnit(value, 'kg') : displayText(value);

// These aliases are for display only. Never write them back into a saved record.
export function getDisplayData(record) {
  const data = record.data || {};
  const next = { ...data };
  if (record.category_id === 'video') {
    next.title = data.title || data.tmdbTitle;
    next.detailGenres = data.detailGenres?.length ? data.detailGenres : data.title?.genres || [];
  }
  if (['dining', 'delivery', 'workMeal'].includes(record.category_id)) {
    const items = displayItems(data.menuItems, data.items, data.menu);
    next.menuItems = items.length ? items : data.menu ? [{ name: displayText(data.menu) }] : [];
  }
  if (record.category_id === 'shopping') {
    next.store = data.store || data.storeName;
    const items = displayItems(data.productItems, data.items);
    next.productItems = items.length ? items : data.product || data.productName ? [{ name: data.product || data.productName, amount: data.productPrice ?? data.amount }] : [];
  }
  if (record.category_id === 'hospital') {
    next.hospitalName = data.hospitalName || data.hospital;
    next.medicalCost = data.medicalCost ?? data.amount;
    next.netMedicalCost = data.netMedicalCost ?? record.amount;
  }
  if (record.category_id === 'fishing') {
    next.targetFish = data.targetFish || data.fishTypes;
    next.catchCount = data.catchCount ?? data.count;
  }
  return next;
}

export function getRecordPeriod(record) {
  if (record.category_id === 'kpass') return getKpassRecordDate(record) || '일자 미기록';
  return formatPeriod(record.data || {}) || record.occurred_on || '';
}

export function getRecordWeather(record) {
  if (['investment', 'video', 'exercise'].includes(record.category_id) || !record.weather_label) return '';
  return `${record.weather_label}${hasValue(record.temperature_max) ? ` · 최고 ${record.temperature_max}°C` : ''}`;
}

export function presentRecord(record) {
  const id = record.category_id;
  const data = getDisplayData(record);
  const result = { title: displayText(getRecordTitle(id, data)), primary: null, details: [], metrics: [], note: data.memo || '', status: '', statusTone: '' };
  const detail = (...values) => { result.details.push(...values.map(displayText).filter(Boolean)); };
  const primary = (label, value, tone = '') => { if (hasValue(value)) result.primary = { label, value, tone }; };
  const money = (label, value, tone = '') => { if (hasValue(value)) primary(label, formatMoney(value), tone); };
  const metric = (label, value, tone = '') => { if (hasValue(value)) result.metrics.push({ label, value, tone }); };
  const cost = record.amount ?? data[CATEGORY_MAP[id]?.amountField];

  switch (id) {
    case 'video':
      result.status = data.watchStatus || '';
      detail(data.mediaType, data.detailGenres);
      result.note = data.memo || data.review || '';
      break;
    case 'dining': case 'workMeal': case 'delivery':
      money(id === 'delivery' ? '총 결제금액' : '기록 금액', record.amount);
      detail(data.payRelation, data.withWhom, data.diningType, data.deliveryPlatform);
      if (id === 'delivery' && hasValue(data.deliveryFee)) detail(`배달료 ${formatMoney(data.deliveryFee)}`);
      break;
    case 'shopping': money('구매 합계', cost); detail(data.purpose); break;
    case 'fishing':
      primary('마릿수', withUnit(data.catchCount, '마리'));
      detail(data.targetFish, data.fishingType, weightText(data.weight), hasValue(cost) ? `비용 ${formatMoney(cost)}` : '');
      break;
    case 'cooking':
      money('재료비', cost); detail(data.duration, data.difficulty, data.ingredients); break;
    case 'recipe': detail(data.ingredients); result.note = data.memo || data.steps || ''; break;
    case 'meeting': money('비용', cost); detail(data.place, data.attendees); break;
    case 'game': primary('플레이시간', data.duration); detail(data.platform); break;
    case 'dream':
      result.title = displayText(data.content).split('\n')[0] || '꿈 기록';
      detail(data.wakeMood, data.emotion);
      result.note = displayText(data.content).split('\n').slice(1).join(' ') || data.analysis || '';
      break;
    case 'idea':
      result.status = data.ideaStatus || ''; detail(data.ideaCategory, data.ideaOrigin); result.note = data.content || data.memo || ''; break;
    case 'outing': case 'domesticTravel': case 'overseasTravel':
      money(id === 'overseasTravel' ? '원화환산 총비용' : '총비용', cost);
      detail(data.cities || data.places, data.companions, data.transport || data.airline, data.period);
      break;
    case 'hospital':
      money('실제 부담금', data.netMedicalCost);
      detail(data.department, data.symptom);
      if (hasValue(data.medicalCost)) metric('병원비', formatMoney(data.medicalCost));
      if (hasValue(data.insuranceRefund)) metric('보험 환급', formatMoney(data.insuranceRefund), 'income');
      break;
    case 'salary':
      money('실수령액', record.income_amount ?? (getSalaryNet(data) + (isEnabled(data.bonus) ? toNumber(data.bonusAmount) : 0)), 'income');
      detail(data.salaryBasis, isEnabled(data.bonus) ? `보너스 ${formatMoney(data.bonusAmount)}` : '');
      break;
    case 'savings':
      money('월납입액', data.monthlyAmount); detail(withUnit(data.interestRate, '%'), data.maturityDate ? `만기 ${data.maturityDate}` : ''); break;
    case 'subscription':
      money('월비용', data.monthlyCost ?? record.amount);
      result.status = hasValue(data.active) ? isEnabled(data.active) ? '활성' : '비활성' : '상태 미설정';
      result.statusTone = isEnabled(data.active) ? 'active' : 'paused';
      detail(data.subscriptionType, hasValue(data.billingDay) ? `매월 ${data.billingDay}일 결제` : '');
      break;
    case 'exercise':
      result.title = '체중관리'; primary('체중', withUnit(data.bodyWeight, 'kg'));
      for (const [key, label] of [['armCm', '팔'], ['waistCm', '허리'], ['thighCm', '허벅지'], ['calfCm', '종아리']]) if (hasValue(data[key])) metric(label, withUnit(data[key], 'cm'));
      break;
    case 'annual_leave':
      result.title = data.recordType === 'grant' ? `${data.year || ''}년 연차 부여` : data.reason || '연차 사용';
      primary(data.recordType === 'grant' ? '부여' : '사용', withUnit(data.recordType === 'grant' ? data.grantDays : data.days, '일'));
      break;
    case 'kpass': {
      const totals = calcKpass(data);
      metric('충전비용', formatMoney(totals.chargeAmount)); metric('환급비용', formatMoney(totals.refundAmount), 'income'); break;
    }
    case 'vehicle':
      money('관리 비용', cost); detail(data.location, withUnit(data.odometerKm, 'km'), data.nextServiceDate ? `다음 점검 ${data.nextServiceDate}` : ''); break;
    case 'culture': money('비용', cost); detail(data.cultureType, data.venue, data.companions); break;
    case 'investment': {
      const type = getInvestmentRecordType(data);
      detail(data.symbol, data.market);
      if (type === 'watch') {
        money('현재가', data.currentPrice);
        if (hasValue(data.priceChangeRate)) metric('전일대비', signed(data.priceChangeRate, (value) => `${toNumber(value).toFixed(2)}%`), toNumber(data.priceChangeRate) >= 0 ? 'expense' : 'income');
        else metric('전일대비', '등락률 대기');
        if (hasValue(data.priceChange)) metric('등락금액', signed(data.priceChange), toNumber(data.priceChange) >= 0 ? 'expense' : 'income');
        if (hasValue(data.targetPrice)) detail(`목표 ${formatMoney(data.targetPrice)}`);
      } else {
        const calc = type === 'sell' ? calcSoldInvestment(data) : calcInvestment(data);
        money(type === 'sell' ? '매도금액' : '평가금액', type === 'sell' ? calc.sellTotal : calc.currentTotal);
        const tone = calc.profit >= 0 ? 'expense' : 'income';
        metric(type === 'sell' ? '실현손익' : '평가손익', signed(calc.profit), tone);
        metric('수익률', signed(calc.rate, (value) => `${toNumber(value).toFixed(2)}%`), tone);
        detail(withUnit(type === 'sell' ? data.soldQuantity : data.quantity, '주'));
      }
      break;
    }
    default: money('금액', cost);
  }
  return result;
}

export function groupAnnualLeave(records) {
  const groups = new Map();
  for (const record of records.filter((item) => item.category_id === 'annual_leave')) {
    const data = record.data || {};
    const date = data.date || record.occurred_on || '';
    const year = String(data.recordType === 'grant' ? data.year || date.slice(0, 4) : date.slice(0, 4)) || '미지정';
    if (!groups.has(year)) groups.set(year, { year, grants: [], uses: [], others: [] });
    groups.get(year)[data.recordType === 'grant' ? 'grants' : data.recordType === 'use' ? 'uses' : 'others'].push(record);
  }
  return [...groups.values()].sort((a, b) => b.year.localeCompare(a.year)).map((group) => ({ ...group,
    uses: [...group.uses].sort((a, b) => String(b.data?.date || b.occurred_on || '').localeCompare(String(a.data?.date || a.occurred_on || '')) || String(b.id).localeCompare(String(a.id))),
  }));
}
