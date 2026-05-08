import { CATEGORY_MAP, DEFAULT_FINANCE_MODES } from '../data/categoryDefinitions';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function toNumber(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + toNumber(item?.amount ?? item?.price ?? item), 0);
  }
  if (value && typeof value === 'object') return 0;
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) ? number : 0;
}

export function formatMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;
}

export function getRecordTitle(categoryId, data = {}) {
  const category = CATEGORY_MAP[categoryId];
  if (!category) return data.title || '기록';
  const raw = data[category.titleField];
  if (typeof raw === 'object' && raw?.title) return raw.title;
  if (Array.isArray(raw)) {
    const names = raw
      .map((item) => (item && typeof item === 'object' ? item.name : item))
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  if (categoryId === 'shopping') return data.product || data.store || '쇼핑';
  return raw || category.label;
}

export function getRecordRating(data = {}) {
  return toNumber(data.rating);
}

export function deriveRecordColumns(categoryId, formData = {}) {
  const category = CATEGORY_MAP[categoryId];
  const title = getRecordTitle(categoryId, formData);
  const occurredOn = formData.date || todayIso();
  const amount = category?.amountField ? toNumber(formData[category.amountField]) : 0;
  const baseIncome = category?.incomeField ? toNumber(formData[category.incomeField]) : 0;
  const incomeAmount = categoryId === 'salary' && formData.bonus
    ? baseIncome + toNumber(formData.bonusAmount)
    : baseIncome;
  const rating = getRecordRating(formData) || null;

  return { title, occurred_on: occurredOn, amount, income_amount: incomeAmount, rating };
}

export function getFinanceMode(categoryId, financeModes = {}) {
  return financeModes[categoryId] || DEFAULT_FINANCE_MODES[categoryId] || 'excluded';
}

export function getRecordFinanceValue(record, financeModes = {}) {
  const mode = getFinanceMode(record.category_id, financeModes);
  if (mode === 'expense') return { expense: toNumber(record.amount), income: 0 };
  if (mode === 'income') return { expense: 0, income: toNumber(record.income_amount || record.amount) };
  return { expense: 0, income: 0 };
}

export function summarizeMonth(records, financeModes, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();

  return records.reduce(
    (summary, record) => {
      const occurred = new Date(`${record.occurred_on}T00:00:00`);
      if (occurred.getFullYear() !== year || occurred.getMonth() !== month) return summary;

      const value = getRecordFinanceValue(record, financeModes);
      summary.count += 1;
      summary.expense += value.expense;
      summary.income += value.income;
      return summary;
    },
    { count: 0, expense: 0, income: 0 },
  );
}

export function flattenSearchText(record) {
  const data = record.data || {};
  const values = Object.values(data).flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return value;
  });

  return [record.title, record.category_id, ...values]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterRecords(records, filters = {}) {
  const query = filters.query?.trim().toLowerCase();
  const minAmount = filters.minAmount === '' ? null : toNumber(filters.minAmount);
  const maxAmount = filters.maxAmount === '' ? null : toNumber(filters.maxAmount);
  const minRating = toNumber(filters.minRating);

  return records
    .filter((record) => {
      if (query && !flattenSearchText(record).includes(query)) return false;
      if (filters.categoryId && record.category_id !== filters.categoryId) return false;
      if (filters.dateFrom && record.occurred_on < filters.dateFrom) return false;
      if (filters.dateTo && record.occurred_on > filters.dateTo) return false;
      const amount = Math.max(toNumber(record.amount), toNumber(record.income_amount));
      if (minAmount !== null && amount < minAmount) return false;
      if (maxAmount !== null && amount > maxAmount) return false;
      if (minRating && toNumber(record.rating) < minRating) return false;
      return true;
    })
    .sort((a, b) => `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`));
}

export function calcDutchPay(data = {}) {
  const amount = toNumber(data.menuItems) || toNumber(data.amount);
  const people = Math.max(1, toNumber(data.peopleCount));
  return Math.round(amount / people);
}

export function calcInvestment(data = {}) {
  const buyPrice = toNumber(data.buyPrice);
  const quantity = toNumber(data.quantity);
  const currentPrice = toNumber(data.currentPrice);
  const buyTotal = buyPrice * quantity;
  const currentTotal = currentPrice * quantity;
  const profit = currentTotal - buyTotal;
  const rate = buyTotal > 0 && currentPrice > 0 ? (profit / buyTotal) * 100 : 0;
  return { buyTotal, currentTotal, profit, rate };
}
