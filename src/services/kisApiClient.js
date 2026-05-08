import { supabase } from '../lib/supabaseClient';

export async function getKisIntegrationStatus() {
  return {
    enabled: false,
    message: '한국투자 API는 서버 Edge Function 구조만 준비되어 있습니다.',
  };
}

export async function fetchKisPrice({ symbol, market }) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const { data, error } = await supabase.functions.invoke('kis-proxy', {
    body: { action: 'quote', symbol, market },
  });
  if (error) throw error;
  return data;
}
