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

  const { ticker } = await req.json().catch(() => ({ ticker: '' }));
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) return json({ error: 'ticker is required.' }, 400);

  // Put the real provider call here later.
  // Keep provider keys in Supabase Edge Function secrets, never in VITE_ env vars.
  return json({
    ticker: symbol,
    currentPrice: null,
    message: 'Stock provider is not connected yet. Add a server-side provider key before enabling live prices.',
  });
});
