-- Restrict browser profile writes without changing existing accounts or records.
begin;

alter table public.profiles enable row level security;

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and role in ('member', 'user'));

-- Restrictive policies also apply if another permissive policy is added later.
drop policy if exists "profiles_insert_member_boundary" on public.profiles;
create policy "profiles_insert_member_boundary"
  on public.profiles as restrictive for insert to authenticated
  with check (id = auth.uid() and role in ('member', 'user'));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_update_owner_boundary" on public.profiles;
create policy "profiles_update_owner_boundary"
  on public.profiles as restrictive for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Table and column grants are independent; revoke both, including PUBLIC grants.
revoke update on table public.profiles from public, anon, authenticated;
revoke update (id, role, created_at, display_name, avatar_color, updated_at)
  on public.profiles from public, anon, authenticated;
grant update (display_name, avatar_color, updated_at)
  on public.profiles to authenticated;

commit;
