import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
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

function normalizeTitle(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatPeriod(data: Record<string, unknown>, occurredOn: string) {
  const start = String(data.startDate || data.date || occurredOn || '');
  const end = String(data.endDate || '');
  if (!start) return '';
  if (end && end !== start) return `${start.replaceAll('-', '.')} ~ ${end.replaceAll('-', '.')}`;
  return start.replaceAll('-', '.');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Shared video function is not configured.' }, 500);
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const jwt = authHeader.replace('Bearer ', '');
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);
  const currentUserId = authData.user.id;

  const body = await req.json().catch(() => ({}));
  const tmdbId = body.tmdbId ? String(body.tmdbId) : '';
  const title = normalizeTitle(body.title);
  const currentRecordId = String(body.recordId || '');
  if (!tmdbId && !title) return json({ reactions: [], averageRating: 0 });

  const { data: friendRows, error: friendError } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
  if (friendError) return json({ error: friendError.message }, 500);

  const friendIds = [...new Set((friendRows || []).map((row) =>
    row.requester_id === currentUserId ? row.addressee_id : row.requester_id,
  ))];
  if (friendIds.length === 0) return json({ reactions: [], averageRating: 0 });

  const { data: shareRows, error: shareError } = await admin
    .from('user_share_settings')
    .select('user_id')
    .eq('category_key', 'video')
    .eq('is_shared', true)
    .eq('allow_friend_compare', true)
    .in('user_id', friendIds);
  if (shareError) return json({ error: shareError.message }, 500);

  const allowedFriendIds = (shareRows || []).map((row) => row.user_id);
  if (allowedFriendIds.length === 0) return json({ reactions: [], averageRating: 0 });

  let recordsQuery = admin
    .from('records')
    .select('id, user_id, occurred_on, rating, title, data, created_at')
    .eq('category_id', 'video')
    .in('user_id', allowedFriendIds)
    .order('occurred_on', { ascending: false })
    .limit(20);

  if (tmdbId) recordsQuery = recordsQuery.eq('data->>tmdbId', tmdbId);

  const { data: records, error: recordsError } = await recordsQuery;
  if (recordsError) return json({ error: recordsError.message }, 500);

  const filteredRecords = (records || []).filter((record) => {
    if (record.id === currentRecordId) return false;
    if (tmdbId) return true;
    return normalizeTitle(record.data?.tmdbTitle || record.data?.title?.title || record.title) === title;
  });

  const userIds = [...new Set(filteredRecords.map((record) => record.user_id))];
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  const reactions = filteredRecords.slice(0, 5).map((record) => ({
    id: record.id,
    userId: record.user_id,
    displayName: profileById.get(record.user_id)?.display_name || '친구',
    rating: Number(record.rating || record.data?.rating || 0),
    memo: String(record.data?.review || record.data?.memo || '').slice(0, 140),
    occurredOn: record.occurred_on,
    period: formatPeriod(record.data || {}, record.occurred_on),
  }));

  const rated = reactions.map((item) => item.rating).filter((value) => Number.isFinite(value) && value > 0);
  const averageRating = rated.length ? rated.reduce((sum, value) => sum + value, 0) / rated.length : 0;

  return json({ reactions, averageRating });
});
