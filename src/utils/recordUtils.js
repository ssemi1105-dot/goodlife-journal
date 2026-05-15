import { CATEGORY_MAP, DEFAULT_FINANCE_MODES } from '../data/categoryDefinitions';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function toNumber(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + (item && typeof item === 'object' ? calcLineItemAmount(item) : toNumber(item)), 0);
  }
  if (value && typeof value === 'object') return 0;
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) ? number : 0;
}

export function calcLineItemAmount(item = {}) {
  const quantity = toNumber(item.quantity) || 1;
  const unitPrice = toNumber(item.unitPrice);
  const discountAmount = toNumber(item.discountAmount);
  if (unitPrice > 0) return Math.max(0, (unitPrice * quantity) - discountAmount);
  return toNumber(item.amount ?? item.price);
}

export function formatMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;
}

export function calcKpass(data = {}) {
  const chargeAmount = toNumber(data.chargeAmount);
  const refundAmount = toNumber(data.refundAmount);
  const netCost = Math.max(0, chargeAmount - refundAmount);
  const refundRate = chargeAmount > 0
    ? ((refundAmount / chargeAmount) * 100).toFixed(1)
    : '0.0';
  return { chargeAmount, refundAmount, netCost, refundRate };
}

export function calcAnnualLeave(records = [], year) {
  const targetYear = year || new Date().getFullYear();
  const yearStr = String(targetYear);

  const grantRecord = records.find(
    (record) => record.data?.recordType === 'grant' && String(record.data?.year) === yearStr,
  );
  const grantDays = toNumber(grantRecord?.data?.grantDays);

  const usedDays = records
    .filter((record) => record.data?.recordType === 'use' && record.data?.date?.startsWith(yearStr))
    .reduce((sum, record) => sum + toNumber(record.data?.days), 0);

  const remainDays = Math.max(0, grantDays - usedDays);
  const usedRate = grantDays > 0 ? (usedDays / grantDays) * 100 : 0;

  return { grantDays, usedDays, remainDays, usedRate };
}

export function getRecordTitle(categoryId, data = {}) {
  const category = CATEGORY_MAP[categoryId];
  if (!category) return data.title || '기록';
  if (categoryId === 'investment') return data.assetName || data.symbol || data.ticker || '투자';
  if (categoryId === 'hospital') return data.hospitalName || data.hospital || '병원진료';
  if (categoryId === 'kpass') return data.yearMonth || 'K-pass';
  if (categoryId === 'annual_leave') {
    if (data.recordType === 'grant') return `📋 ${data.year || ''}년 연차 부여 — ${toNumber(data.grantDays)}일`;
    if (data.recordType === 'use') {
      const reason = data.reason ? ` (${data.reason})` : '';
      return `✂️ ${data.date || ''} — ${toNumber(data.days)}일 사용${reason}`;
    }
    return '연차관리';
  }
  if (categoryId === 'shopping') {
    const items = data.productItems || data.items || [];
    const first = Array.isArray(items) ? items.find((item) => item?.name) : null;
    return data.store || data.storeName || data.product || first?.name || '쇼핑';
  }
  const raw = data[category.titleField];
  if (typeof raw === 'object' && (raw?.title || raw?.tmdbTitle)) return raw.title || raw.tmdbTitle;
  if (Array.isArray(raw)) {
    const names = raw
      .map((item) => (item && typeof item === 'object' ? item.name : item))
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  return raw || category.label;
}

export function getRecordRating(data = {}) {
  return toNumber(data.rating);
}

export function deriveRecordColumns(categoryId, formData = {}) {
  const category = CATEGORY_MAP[categoryId];
  const title = getRecordTitle(categoryId, formData);
  const occurredOn = formData.startDate || formData.date || todayIso();
  let amount = category?.amountField ? toNumber(formData[category.amountField]) : 0;
  if (['dining', 'shopping', 'workMeal'].includes(categoryId)) {
    amount = toNumber(formData.menuItems || formData.productItems);
  }
  if (categoryId === 'investment') {
    amount = toNumber(formData.buyAmount) || toNumber(formData.avgBuyPrice) * toNumber(formData.quantity);
  }
  if (categoryId === 'hospital') amount = toNumber(formData.netMedicalCost);
  if (categoryId === 'kpass') amount = calcKpass(formData).netCost;
  if (categoryId === 'annual_leave') amount = 0;
  let occurred_on = occurredOn;
  if (categoryId === 'kpass' && formData.yearMonth) occurred_on = `${formData.yearMonth}-01`;
  if (categoryId === 'annual_leave') {
    occurred_on = formData.recordType === 'grant'
      ? `${formData.year || new Date().getFullYear()}-01-01`
      : formData.date || todayIso();
  }
  const baseIncome = category?.incomeField ? toNumber(formData[category.incomeField]) : 0;
  const incomeAmount = categoryId === 'salary' && formData.bonus
    ? baseIncome + toNumber(formData.bonusAmount)
    : baseIncome;
  const rating = getRecordRating(formData) || null;

  return { title, occurred_on, amount, income_amount: incomeAmount, rating };
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

export function getPeriodRange(period = 'month', date = new Date()) {
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (period === 'week') {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (period === 'quarter') {
    const quarterStart = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStart, 1);
    end.setFullYear(start.getFullYear(), quarterStart + 3, 0);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function summarizePeriod(records, financeModes, period = 'month', date = new Date()) {
  const range = getPeriodRange(period, date);
  return records.reduce(
    (summary, record) => {
      if (record.occurred_on < range.start || record.occurred_on > range.end) return summary;
      const value = getRecordFinanceValue(record, financeModes);
      summary.count += 1;
      summary.expense += value.expense;
      summary.income += value.income;
      return summary;
    },
    { count: 0, expense: 0, income: 0, range },
  );
}

export function summarizeCategoryTotals(records, financeModes, period = 'month', date = new Date()) {
  const range = getPeriodRange(period, date);
  const totals = new Map();
  records.forEach((record) => {
    if (record.occurred_on < range.start || record.occurred_on > range.end) return;
    const value = getRecordFinanceValue(record, financeModes);
    const current = totals.get(record.category_id) || { categoryId: record.category_id, expense: 0, income: 0, count: 0 };
    current.expense += value.expense;
    current.income += value.income;
    current.count += 1;
    totals.set(record.category_id, current);
  });
  return [...totals.values()].sort((a, b) => b.expense - a.expense || b.income - a.income);
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
  const quantity = toNumber(data.quantity);
  const avgBuyPrice = toNumber(data.avgBuyPrice);
  const currentPrice = toNumber(data.currentPrice);
  const quantityBuyTotal = avgBuyPrice * quantity;
  const quantityCurrentTotal = currentPrice * quantity;
  const legacyBuyTotal = toNumber(data.buyPrice) * toNumber(data.quantity);
  const legacyCurrentTotal = toNumber(data.currentPrice) * toNumber(data.quantity);
  const buyTotal = quantityBuyTotal || toNumber(data.buyAmount) || legacyBuyTotal;
  const currentTotal = quantityCurrentTotal || toNumber(data.currentAmount) || legacyCurrentTotal;
  const profit = currentTotal - buyTotal;
  const rate = toNumber(data.profitLossRate) || (buyTotal > 0 && currentTotal > 0 ? (profit / buyTotal) * 100 : 0);
  return { buyTotal, currentTotal, profit, rate, quantity, avgBuyPrice, currentPrice };
}

export function formatPeriod(data = {}) {
  const start = data.startDate || data.date;
  const end = data.endDate;
  if (!start) return '';
  const format = (value) => value.replaceAll('-', '.');
  if (end && end !== start) return `${format(start)} ~ ${format(end)}`;
  return format(start);
}
