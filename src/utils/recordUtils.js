import { CATEGORY_MAP, DEFAULT_FINANCE_MODES } from '../data/categoryDefinitions';

export function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  if (item.pricingMode === 'amount') return toNumber(item.amount ?? item.price);
  const quantity = item.quantity === '' || item.quantity === null || item.quantity === undefined ? 1 : toNumber(item.quantity);
  const unitPrice = toNumber(item.unitPrice);
  const discountAmount = toNumber(item.discountAmount);
  if (item.pricingMode === 'unit' || (item.unitPrice !== '' && item.unitPrice !== null && item.unitPrice !== undefined)) return Math.max(0, (unitPrice * quantity) - discountAmount);
  return toNumber(item.amount ?? item.price);
}

export function normalizeLineItem(item = {}, quantityMode = false) {
  if (!quantityMode) return { ...item, pricingMode: 'amount', unitPrice: null, quantity: null, discountAmount: 0, amount: item.amount ?? item.price ?? '' };
  const quantity = item.quantity ?? 1;
  const unitPrice = item.unitPrice ?? ((toNumber(item.amount ?? item.price) + toNumber(item.discountAmount)) / (toNumber(quantity) || 1));
  return { ...item, pricingMode: 'unit', unitPrice, quantity };
}

export function getSalaryNet(data = {}) {
  return data.salaryBasis === '세전'
    ? Math.max(0, toNumber(data.grossAmount) - toNumber(data.tax))
    : toNumber(data.netAmount);
}

export function formatMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;
}

export function getMenuPreview(data = {}) {
  // Older records may have a single menu string instead of line items.
  for (const source of [data.menuItems, data.items, data.menu]) {
    const rows = Array.isArray(source) ? source : [source];
    const names = rows
      .map((item) => typeof item === 'string' ? item : item?.name)
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.trim());
    if (names.length) {
      return {
        label: names.length > 1 ? `${names[0]} 외 ${names.length - 1}개` : names[0],
        fullText: names.join(', '),
      };
    }
  }
  return { label: '', fullText: '' };
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

  const grantRecord = records
    .filter((record) => record.data?.recordType === 'grant' && String(record.data?.year) === yearStr)
    .sort((a, b) => `${b.updated_at || ''}${b.created_at || ''}`.localeCompare(`${a.updated_at || ''}${a.created_at || ''}`))[0];
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
  if (categoryId === 'investment') {
    const type = getInvestmentRecordType(data);
    const name = data.assetName || data.symbol || data.ticker || '투자';
    if (type === 'watch') return `${name} 관심`;
    if (type === 'sell') return `${name} 매도`;
    return `${name} 매수`;
  }
  if (categoryId === 'exercise') return data.bodyWeight ? `체중 ${toNumber(data.bodyWeight)}kg` : data.type || '체중관리';
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
  if (categoryId === 'vehicle') {
    const vehicleName = data.vehicleName || '차량';
    return data.maintenanceType ? `${data.maintenanceType} · ${vehicleName}` : vehicleName;
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
  const amountField = category?.fields.find((field) => field.id === category.amountField);
  let amount = amountField?.type === 'lineItems'
    ? (formData[amountField.id] || []).reduce((sum, item) => sum + calcLineItemAmount(normalizeLineItem(item, amountField.quantityMode)), 0)
    : category?.amountField ? toNumber(formData[category.amountField]) : 0;
  if (['dining', 'shopping', 'workMeal'].includes(categoryId)) {
    const items = formData.menuItems || formData.productItems || formData.items;
    if (Array.isArray(items)) amount = items.reduce((sum, item) => sum + calcLineItemAmount(normalizeLineItem(item, amountField?.quantityMode)), 0);
  }
  if (categoryId === 'investment') {
    const type = getInvestmentRecordType(formData);
    if (type === 'buy') {
      amount = calcInvestment(formData).buyTotal;
    } else {
      amount = 0;
    }
  }
  if (categoryId === 'hospital') amount = toNumber(formData.netMedicalCost);
  if (categoryId === 'kpass') amount = calcKpass(formData).netCost;
  if (categoryId === 'annual_leave') amount = 0;
  let occurred_on = occurredOn;
  if (categoryId === 'investment' && getInvestmentRecordType(formData) === 'sell') {
    occurred_on = formData.sellDate || occurredOn;
  }
  if (categoryId === 'kpass' && formData.yearMonth) occurred_on = `${formData.yearMonth}-01`;
  if (categoryId === 'annual_leave') {
    occurred_on = formData.recordType === 'grant'
      ? `${formData.year || new Date().getFullYear()}-01-01`
      : formData.date || todayIso();
  }
  const baseIncome = categoryId === 'salary' ? getSalaryNet(formData) : category?.incomeField ? toNumber(formData[category.incomeField]) : 0;
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
    start: todayIso(start),
    end: todayIso(end),
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
  function values(value) {
    if (Array.isArray(value)) return value.flatMap(values);
    if (value && typeof value === 'object') return Object.entries(value)
      .filter(([key]) => !['signedUrl', 'previewUrl', 'url', 'path', '_clientId'].includes(key))
      .flatMap(([, item]) => values(item));
    return value === null || value === undefined ? [] : [String(value)];
  }
  return [record.title, record.category_id, CATEGORY_MAP[record.category_id]?.label, ...values(record.data || {})]
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .normalize('NFC')
    .toLowerCase();
}

export function filterRecords(records, filters = {}) {
  const query = filters.query?.trim().normalize('NFC').toLowerCase();
  const minAmount = filters.minAmount == null || filters.minAmount === '' ? null : toNumber(filters.minAmount);
  const maxAmount = filters.maxAmount == null || filters.maxAmount === '' ? null : toNumber(filters.maxAmount);
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

export function getInvestmentRecordType(data = {}) {
  if (data.recordType === 'holding') return 'buy';
  if (data.recordType === 'sold') return 'sell';
  if (['buy', 'watch', 'sell'].includes(data.recordType)) return data.recordType;
  if (data.sellDate || data.sellPrice || data.soldQuantity || data.realizedProfit) return 'sell';
  if (data.targetPrice && !data.quantity && !data.avgBuyPrice) return 'watch';
  return 'buy';
}

function normalizeInvestmentText(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function getInvestmentAssetKey(data = {}) {
  const market = normalizeInvestmentText(data.market || 'KR');
  const identity = normalizeInvestmentText(data.symbol || data.ticker || data.assetName);
  return identity ? `${market}:${identity}` : '';
}

export function validateInvestmentLedger(records = [], assetKeys = null) {
  const balances = new Map();
  const affected = assetKeys ? new Set(assetKeys) : null;
  const ordered = records.filter((record) => record.category_id === 'investment')
    .sort((a, b) => `${a.occurred_on || ''}${a.created_at || ''}${a.id || ''}`.localeCompare(`${b.occurred_on || ''}${b.created_at || ''}${b.id || ''}`));
  for (const record of ordered) {
    const data = record.data || {};
    const type = getInvestmentRecordType(data);
    const key = getInvestmentAssetKey(data);
    if (type === 'watch' || (affected && !affected.has(key))) continue;
    const quantity = toNumber(type === 'sell' ? data.soldQuantity || data.quantity : data.quantity);
    if (!key || quantity <= 0) throw new Error('종목과 0보다 큰 거래수량을 입력해주세요.');
    const balance = balances.get(key) || 0;
    if (type === 'sell' && quantity > balance + 0.0000001) {
      throw new Error(`${record.occurred_on} ${data.assetName || data.symbol || '종목'}: 당시 보유수량은 ${balance}주입니다. 매수·매도 날짜와 수량을 확인해주세요.`);
    }
    balances.set(key, balance + (type === 'sell' ? -quantity : quantity));
  }
}

export function buildInvestmentLedger(records = []) {
  const investmentRecords = records
    .filter((record) => record.category_id === 'investment')
    .sort((a, b) => `${a.occurred_on || ''}${a.created_at || ''}${a.id || ''}`.localeCompare(`${b.occurred_on || ''}${b.created_at || ''}${b.id || ''}`));
  const positionsByKey = new Map();
  const watchRecords = [];
  const transactions = [];

  investmentRecords.forEach((record) => {
    const data = record.data || {};
    const type = getInvestmentRecordType(data);
    if (type === 'watch') {
      watchRecords.push(record);
      return;
    }

    const key = getInvestmentAssetKey(data);
    if (!key) return;
    const current = positionsByKey.get(key) || {
      key,
      market: data.market || 'KR',
      symbol: data.symbol || data.ticker || '',
      assetName: data.assetName || data.symbol || data.ticker || '투자',
      investmentType: data.investmentType || '국내주식',
      quantity: 0,
      costBasis: 0,
      currentPrice: 0,
      realizedProfit: 0,
      buyRecords: [],
      sellRecords: [],
      latestRecord: record,
    };

    current.market = data.market || current.market;
    current.symbol = data.symbol || data.ticker || current.symbol;
    current.assetName = data.assetName || current.assetName;
    current.investmentType = data.investmentType || current.investmentType;
    if (toNumber(data.currentPrice) > 0) current.currentPrice = toNumber(data.currentPrice);
    current.latestRecord = record;

    if (type === 'buy') {
      const quantity = toNumber(data.quantity);
      const unitPrice = toNumber(data.avgBuyPrice || data.buyPrice);
      current.quantity += quantity;
      current.costBasis += unitPrice * quantity;
      current.buyRecords.push(record);
      transactions.push(record);
    } else if (type === 'sell') {
      const soldQuantity = toNumber(data.soldQuantity || data.quantity);
      const averageCost = current.quantity > 0
        ? current.costBasis / current.quantity
        : toNumber(data.avgBuyPrice || data.buyPrice);
      const matchedQuantity = Math.min(current.quantity, soldQuantity);
      const matchedCost = averageCost * matchedQuantity;
      current.quantity = Math.max(0, current.quantity - matchedQuantity);
      current.costBasis = Math.max(0, current.costBasis - matchedCost);
      current.realizedProfit += (toNumber(data.sellPrice) * soldQuantity) - (averageCost * soldQuantity) - toNumber(data.feeTax);
      current.sellRecords.push(record);
      transactions.push(record);
    }

    positionsByKey.set(key, current);
  });

  const positions = [...positionsByKey.values()]
    .filter((position) => position.quantity > 0.0000001)
    .map((position) => {
      const avgBuyPrice = position.quantity > 0 ? position.costBasis / position.quantity : 0;
      const currentTotal = position.currentPrice * position.quantity;
      const profit = currentTotal - position.costBasis;
      const rate = position.costBasis > 0 ? (profit / position.costBasis) * 100 : 0;
      return {
        ...position,
        avgBuyPrice,
        buyTotal: position.costBasis,
        currentTotal,
        profit,
        rate,
      };
    })
    .sort((a, b) => b.currentTotal - a.currentTotal || a.assetName.localeCompare(b.assetName, 'ko'));

  return {
    positions,
    watchRecords: [...watchRecords].sort((a, b) => `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`)),
    transactions: [...transactions].sort((a, b) => `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`)),
  };
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

export function calcSoldInvestment(data = {}) {
  const soldQuantity = toNumber(data.soldQuantity) || toNumber(data.quantity);
  const avgBuyPrice = toNumber(data.avgBuyPrice);
  const sellPrice = toNumber(data.sellPrice);
  const feeTax = toNumber(data.feeTax);
  const buyTotal = avgBuyPrice * soldQuantity;
  const sellTotal = sellPrice * soldQuantity;
  const profit = sellTotal - buyTotal - feeTax;
  const rate = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;
  return { soldQuantity, avgBuyPrice, sellPrice, feeTax, buyTotal, sellTotal, profit, rate };
}

export function formatPeriod(data = {}) {
  const start = data.startDate || data.date;
  const end = data.endDate;
  if (!start) return '';
  const format = (value) => value.replaceAll('-', '.');
  if (end && end !== start) return `${format(start)} ~ ${format(end)}`;
  return format(start);
}
