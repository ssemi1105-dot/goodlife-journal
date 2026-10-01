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

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Friend function is not configured.' }, 500);
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const jwt = authHeader.replace('Bearer ', '');
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);

  const currentUserId = authData.user.id;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === 'send-request') {
    const email = normalizeEmail(body.email);
    if (!email) return json({ error: 'Email is required.' }, 400);

    const { data: userPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: listError.message }, 500);

    const target = (userPage.users || []).find((user) => normalizeEmail(user.email) === email);
    if (!target) return json({ error: '해당 이메일의 사용자를 찾지 못했습니다.' }, 404);
    if (target.id === currentUserId) return json({ error: '내 계정에는 친구 요청을 보낼 수 없습니다.' }, 400);

    const requesterId = currentUserId < target.id ? currentUserId : target.id;
    const addresseeId = currentUserId < target.id ? target.id : currentUserId;
    const directionRequester = currentUserId;
    const directionAddressee = target.id;

    const { data: existing, error: existingError } = await admin.from('friendships')
      .select('id, status, requester_id').eq('pair_low', requesterId).eq('pair_high', addresseeId).maybeSingle();
    if (existingError) return json({ error: '친구 관계를 확인하지 못했습니다.' }, 500);
    if (existing?.status === 'blocked') return json({ error: '요청할 수 없는 연결입니다.' }, 403);
    if (existing?.status === 'accepted' || (existing?.status === 'pending' && existing.requester_id === currentUserId)) return json({ ok: true });
    if (existing?.status === 'pending') return json({ error: '이미 받은 요청이 있습니다. 친구 목록에서 수락해주세요.' }, 409);
    const payload = {
      requester_id: directionRequester,
      addressee_id: directionAddressee,
      pair_low: requesterId,
      pair_high: addresseeId,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = existing
      ? await admin.from('friendships').update(payload).eq('id', existing.id).eq('status', 'rejected').select('id')
      : await admin.from('friendships').insert(payload).select('id');
    if (error?.code === '23505' || (!error && !saved?.length)) return json({ error: '요청 상태가 바뀌었습니다. 다시 불러와 주세요.' }, 409);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  }

  if (action === 'respond') {
    const friendshipId = String(body.friendshipId || '');
    const status = String(body.status || '');
    if (!['accepted', 'rejected'].includes(status)) return json({ error: 'Invalid status.' }, 400);

    const { data: friendship, error: loadError } = await admin
      .from('friendships')
      .select('id, addressee_id, status')
      .eq('id', friendshipId)
      .maybeSingle();
    if (loadError) return json({ error: loadError.message }, 500);
    if (!friendship) return json({ error: 'Friend request not found.' }, 404);
    if (friendship.addressee_id !== currentUserId) return json({ error: 'Forbidden' }, 403);
    if (friendship.status !== 'pending') return json({ error: '이미 처리된 친구 요청입니다.' }, 409);

    const { data: changed, error } = await admin
      .from('friendships')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', friendshipId).eq('addressee_id', currentUserId).eq('status', 'pending').select('id');
    if (error) return json({ error: error.message }, 500);
    if (!changed?.length) return json({ error: '요청 상태가 바뀌었습니다. 다시 불러와 주세요.' }, 409);
    return json({ ok: true });
  }

  if (action === 'list') {
    const { data: rows, error } = await admin
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at, updated_at')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
      .order('updated_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);

    const otherIds = [...new Set((rows || []).map((row) =>
      row.requester_id === currentUserId ? row.addressee_id : row.requester_id,
    ))];

    const { data: profiles } = otherIds.length
      ? await admin.from('profiles').select('id, display_name, role').in('id', otherIds)
      : { data: [] };
    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const emailById = new Map((usersPage?.users || []).map((user) => [user.id, user.email]));

    return json({
      friends: (rows || []).map((row) => {
        const otherId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
        const profile = profileById.get(otherId);
        return {
          id: row.id,
          userId: otherId,
          displayName: profile?.display_name || '',
          email: emailById.get(otherId) || '',
          role: profile?.role || 'member',
          status: row.status,
          direction: row.requester_id === currentUserId ? 'outgoing' : 'incoming',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    });
  }

  return json({ error: 'Unknown action.' }, 400);
});
