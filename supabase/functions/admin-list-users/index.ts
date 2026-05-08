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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Admin function is not configured.' }, 500);
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const jwt = authHeader.replace('Bearer ', '');
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!['owner', 'admin'].includes(profile?.role)) return json({ error: 'Forbidden' }, 403);

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at', { ascending: true });
  if (profilesError) return json({ error: profilesError.message }, 500);

  const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return json({ error: usersError.message }, 500);
  const emailById = new Map((userPage.users || []).map((user) => [user.id, user.email]));
  const lastSignInById = new Map((userPage.users || []).map((user) => [user.id, user.last_sign_in_at]));

  return json({
    users: (profiles || []).map((item) => ({
      id: item.id,
      email: emailById.get(item.id) || '',
      displayName: item.display_name,
      role: item.role,
      createdAt: item.created_at,
      lastSignInAt: lastSignInById.get(item.id) || null,
    })),
  });
});
