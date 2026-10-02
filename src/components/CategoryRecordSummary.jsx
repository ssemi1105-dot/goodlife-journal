import { formatMoney, getSalaryNet, toNumber, todayIso } from '../utils/recordUtils';
import { isEnabled } from '../utils/recordPresentation';

export function categorySummaryValues(categoryId, records, date = new Date()) {
  const own = records.filter((record) => record.category_id === categoryId);
  const month = todayIso(date).slice(0, 7);
  const monthly = own.filter((record) => (record.occurred_on || record.data?.date || '').startsWith(month));
  const sum = (rows, getValue) => rows.reduce((total, record) => total + toNumber(getValue(record)), 0);
  if (categoryId === 'salary') {
    const salary = (record) => record.income_amount ?? (getSalaryNet(record.data || {}) + (isEnabled(record.data?.bonus) ? toNumber(record.data?.bonusAmount) : 0));
    return [{ label: '총 수입', value: formatMoney(sum(own, salary)), tone: 'income' }, { label: '이번 달 수입', value: formatMoney(sum(monthly, salary)), tone: 'income' }];
  }
  if (categoryId === 'savings') return [
    { label: '기록된 납입액', value: formatMoney(sum(own, (r) => r.data?.monthlyAmount)) },
    { label: '이번 달 납입 기록', value: formatMoney(sum(monthly, (r) => r.data?.monthlyAmount)) },
  ];
  if (['video', 'recipe', 'game', 'dream', 'idea'].includes(categoryId)) return [
    { label: '전체 기록', value: `${own.length}건` }, { label: '이번 달 기록', value: `${monthly.length}건` },
  ];
  const amount = (record) => categoryId === 'hospital' ? record.data?.netMedicalCost ?? record.amount : record.amount;
  const labels = categoryId === 'workMeal' ? ['총 식사비', '이번 달 식사비'] : categoryId === 'hospital' ? ['총 실제 부담금', '이번 달 부담금'] : categoryId === 'subscription' ? ['누적 기록금액', '이번 달 기록금액'] : ['총 지출', '이번 달 지출'];
  return [{ label: labels[0], value: formatMoney(sum(own, amount)) }, { label: labels[1], value: formatMoney(sum(monthly, amount)) }];
}

export default function CategoryRecordSummary({ categoryId, records }) {
  return <section className="category-summary-strip record-category-summary">
    {categorySummaryValues(categoryId, records).map((item) => <div key={item.label}><span>{item.label}</span><strong className={item.tone}>{item.value}</strong></div>)}
  </section>;
}
