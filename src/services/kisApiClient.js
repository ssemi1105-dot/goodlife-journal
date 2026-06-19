import { supabase } from '../lib/supabaseClient';

const LOCAL_KR_SYMBOLS = [
  { symbol: '000660', name: 'SK하이닉스', market: 'KR', aliases: ['sk하이닉스', '에스케이하이닉스', '하이닉스'] },
  { symbol: '005930', name: '삼성전자', market: 'KR', aliases: ['삼전', '삼성'] },
  { symbol: '005935', name: '삼성전자우', market: 'KR', aliases: ['삼성전자 우', '삼전우'] },
  { symbol: '035420', name: 'NAVER', market: 'KR', aliases: ['네이버', 'naver'] },
  { symbol: '035720', name: '카카오', market: 'KR', aliases: ['kakao'] },
  { symbol: '005380', name: '현대차', market: 'KR', aliases: ['현대자동차'] },
  { symbol: '000270', name: '기아', market: 'KR', aliases: ['기아차'] },
  { symbol: '373220', name: 'LG에너지솔루션', market: 'KR', aliases: ['lg에너지솔루션', '엘지에너지솔루션', 'lg엔솔'] },
  { symbol: '207940', name: '삼성바이오로직스', market: 'KR', aliases: ['삼바', '삼성바이오'] },
  { symbol: '068270', name: '셀트리온', market: 'KR', aliases: [] },
];

function normalizeKeyword(value) {
  return String(value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s()[\]{}._-]/g, '');
}

function normalizeKisResults(data) {
  const raw = Array.isArray(data)
    ? data
    : data?.results || data?.result || data?.items || data?.output || data?.data || [];

  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      symbol: item.symbol || item.code || item.ticker || item.pdno || item.stck_shrn_iscd || '',
      name: item.name || item.assetName || item.prdt_name || item.hts_kor_isnm || item.korName || '',
      market: item.market || item.mket_id_cd || item.exchange || 'KR',
    }))
    .filter((item) => item.symbol || item.name);
}

function getLocalSymbolMatches(keyword) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];

  return LOCAL_KR_SYMBOLS.filter((item) => {
    const candidates = [item.symbol, item.name, ...(item.aliases || [])].map(normalizeKeyword);
    return candidates.some((candidate) => candidate.includes(normalized) || normalized.includes(candidate));
  }).map(({ aliases, ...item }) => item);
}

function mergeSymbolResults(primary = [], fallback = []) {
  const seen = new Set();
  return [...primary, ...fallback].filter((item) => {
    const key = `${item.symbol}-${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseQuoteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replaceAll(',', '').replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pickQuoteField(source, keys) {
  const candidates = {
    ...(source || {}),
    ...(source?.output || {}),
    ...(source?.result || {}),
    ...(source?.data || {}),
    ...(source?.quote || {}),
  };
  return keys.map((key) => candidates[key]).find((value) => value !== null && value !== undefined && value !== '');
}

function applyKisSign(value, sign) {
  if (value === null || value === undefined) return value;
  const signValue = String(sign || '').trim();
  if (['4', '5', '-'].includes(signValue)) return -Math.abs(value);
  if (['1', '2', '+'].includes(signValue)) return Math.abs(value);
  return value;
}

function normalizeKisQuote(data = {}) {
  const sign = pickQuoteField(data, ['changeSign', 'priceChangeSign', 'prdy_vrss_sign', 'sign']);
  const currentPrice = parseQuoteNumber(pickQuoteField(data, ['currentPrice', 'price', 'stck_prpr', 'last', 'close']));
  const previousClose = parseQuoteNumber(pickQuoteField(data, ['previousClose', 'prevClose', 'prdy_clpr', 'stck_sdpr']));
  const rawPriceChange = parseQuoteNumber(pickQuoteField(data, ['priceChange', 'changePrice', 'dayChange', 'prdy_vrss', 'diff']));
  const rawPriceChangeRate = parseQuoteNumber(pickQuoteField(data, ['priceChangeRate', 'changeRate', 'dayChangeRate', 'prdy_ctrt', 'rate']));
  const computedChange = currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;
  const priceChange = applyKisSign(rawPriceChange ?? computedChange, sign);
  const computedRate = previousClose > 0 && priceChange !== null ? (priceChange / previousClose) * 100 : null;
  const priceChangeRate = applyKisSign(rawPriceChangeRate ?? computedRate, sign);

  return {
    ...data,
    currentPrice: currentPrice ?? data.currentPrice,
    previousClose: previousClose ?? data.previousClose,
    priceChange: priceChange ?? data.priceChange,
    priceChangeRate: priceChangeRate ?? data.priceChangeRate,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
}

/**
 * 현재가 조회. 계좌 연동 없이 시세만 조회한다.
 */
export async function fetchKisPrice({ symbol, market = 'KR' }) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const { data, error } = await supabase.functions.invoke('kis-proxy', {
    body: { action: 'quote', symbol, market },
  });
  if (error) throw new Error(`fetchKisPrice failed: ${error.message}`);
  return normalizeKisQuote(data);
}

/**
 * 종목명으로 종목코드를 검색한다.
 * 예: searchKisSymbol('삼성전자') -> [{ symbol: '005930', name: '삼성전자' }]
 */
export async function searchKisSymbol(name) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const localMatches = getLocalSymbolMatches(name);
  const { data, error } = await supabase.functions.invoke('kis-proxy', {
    body: { action: 'search', name, query: name, keyword: name },
  });
  if (error) {
    if (localMatches.length > 0) return localMatches;
    throw new Error(`searchKisSymbol failed: ${error.message}`);
  }
  return mergeSymbolResults(normalizeKisResults(data), localMatches);
}
