import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { action, symbol, market } = await req.json().catch(() => ({}));
  const appKey = Deno.env.get('KIS_APP_KEY');
  const appSecret = Deno.env.get('KIS_APP_SECRET');
  const accountNo = Deno.env.get('KIS_ACCOUNT_NO');

  if (!appKey || !appSecret || !accountNo) {
    return json({
      enabled: false,
      action,
      symbol,
      market,
      message: 'KIS secrets are not configured. Store KIS_APP_KEY, KIS_APP_SECRET, and KIS_ACCOUNT_NO as Supabase Edge Function secrets.',
    });
  }

  return json({
    enabled: false,
    action,
    symbol,
    market,
    message: 'KIS proxy skeleton is ready. Token issuance and quote endpoints are intentionally disabled until final API settings are confirmed.',
  });
});
