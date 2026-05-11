import { supabase } from '../lib/supabaseClient';

/**
 * 현재가 조회. 계좌 연동 없이 시세만 조회한다.
 */
export async function fetchKisPrice({ symbol, market = 'KR' }) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const { data, error } = await supabase.functions.invoke('kis-proxy', {
    body: { action: 'quote', symbol, market },
  });
  if (error) throw new Error(`fetchKisPrice failed: ${error.message}`);
  return data;
}

/**
 * 종목명으로 종목코드를 검색한다.
 * 예: searchKisSymbol('삼성전자') -> [{ symbol: '005930', name: '삼성전자' }]
 */
export async function searchKisSymbol(name) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const { data, error } = await supabase.functions.invoke('kis-proxy', {
    body: { action: 'search', name },
  });
  if (error) throw new Error(`searchKisSymbol failed: ${error.message}`);
  return data?.results || [];
}
