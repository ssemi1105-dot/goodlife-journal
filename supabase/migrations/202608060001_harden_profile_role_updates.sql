-- Prevent authenticated clients from promoting their own profiles.
-- Run through `supabase db push` or the Supabase SQL Editor.

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  with check (
    id = auth.uid()
    and role in ('member', 'user')
  );

revoke update on table public.profiles from authenticated;
grant update (display_name, avatar_color, updated_at) on table public.profiles to authenticated;
