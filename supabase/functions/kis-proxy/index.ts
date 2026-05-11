import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KIS_APP_KEY = Deno.env.get('KIS_APP_KEY')!;
const KIS_APP_SECRET = Deno.env.get('KIS_APP_SECRET')!;
const KIS_BASE_URL = Deno.env.get('KIS_BASE_URL') ?? 'https://openapi.koreainvestment.com:9443';

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function saveToken(payload: {
  access_token: string;
  refresh_token?: string | null;
  token_type?: string;
  expires_at: string;
  refresh_expires_at?: string | null;
}) {
  const { error } = await db.from('kis_token_cache').upsert({
    id: 'default',
    ...payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Token save failed: ${error.message}`);
}

async function loadToken() {
  const { data, error } = await db
    .from('kis_token_cache')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw new Error(`Token load failed: ${error.message}`);
  return data;
}

async function issueOrRefreshToken(refreshToken?: string | null): Promise<string> {
  const body = refreshToken
    ? { grant_type: 'refresh_token', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET, refresh_token: refreshToken }
    : { grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET };

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS token request failed: ${res.status} ${text}`);
  }

  const token = await res.json();
  const expiresIn = Number(token.expires_in ?? 86400);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const refreshExpiresAt = token.refresh_token_token_expired
    ? new Date(token.refresh_token_token_expired).toISOString()
    : null;

  await saveToken({
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? refreshToken ?? null,
    token_type: token.token_type ?? 'Bearer',
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
  });

  return token.access_token;
}

async function getValidToken(): Promise<string> {
  const cached = await loadToken();
  const BUFFER_MS = 60 * 60 * 1000;

  if (cached?.access_token && new Date(cached.expires_at).getTime() - Date.now() > BUFFER_MS) {
    return cached.access_token;
  }

  return issueOrRefreshToken(cached?.refresh_token);
}

async function searchSymbol(name: string) {
  const accessToken = await getValidToken();

  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/search-stock-info`);
  url.searchParams.set('PRDT_TYPE_CD', '300');
  url.searchParams.set('MKET_ID_CD', 'STK');
  url.searchParams.set('PDNO', name);

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: 'CTPF1604R',
      custtype: 'P',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const items = Array.isArray(data.output) ? data.output : [data.output].filter(Boolean);

  return items.map((item: Record<string, string>) => ({
    symbol: item.pdno ?? item.shtn_pdno,
    name: item.prdt_abrv_name ?? item.prdt_name,
  }));
}

async function fetchQuote({ symbol, market }: { symbol: string; market?: string }) {
  const accessToken = await getValidToken();
  const isKR = !market || market === 'KR' || market === 'stock_kr';

  const url = new URL(
    isKR
      ? `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`
      : `${KIS_BASE_URL}/uapi/overseas-price/v1/quotations/price`
  );

  if (isKR) {
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    url.searchParams.set('FID_INPUT_ISCD', symbol);
  } else {
    url.searchParams.set('AUTH', '');
    url.searchParams.set('EXCD', market ?? 'NAS');
    url.searchParams.set('SYMB', symbol);
  }

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: isKR ? 'FHKST01010100' : 'HHDFS00000300',
      custtype: 'P',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS quote failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const rawPrice = isKR ? data.output?.stck_prpr : data.output?.last;
  const currentPrice = Number(rawPrice ?? 0);

  if (!currentPrice) {
    throw new Error(`종목코드 ${symbol}의 현재가를 가져올 수 없습니다.`);
  }

  return {
    enabled: true,
    symbol,
    market: market ?? 'KR',
    currentPrice,
    fetchedAt: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { action, symbol, market, name } = await req.json().catch(() => ({}));

    if (action === 'quote') {
      if (!symbol) throw new Error('symbol is required');
      const result = await fetchQuote({ symbol, market });
      return json(result);
    }

    if (action === 'search') {
      if (!name) throw new Error('name is required');
      const results = await searchSymbol(name);
      return json({ results });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[kis-proxy]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
