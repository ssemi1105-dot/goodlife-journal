begin;

-- Keep personal records private even when legacy visibility/share rows exist.
drop policy if exists "records_select_owner_or_shared" on public.records;
drop policy if exists "records_select_self" on public.records;
create policy "records_select_self" on public.records
  for select to authenticated using (user_id = auth.uid());
-- A restrictive policy also protects deployments with additional old SELECT policies.
drop policy if exists "records_owner_boundary" on public.records;
create policy "records_owner_boundary" on public.records as restrictive
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.records from anon;

drop policy if exists "shares_insert_owner" on public.record_shares;
revoke insert, update on public.record_shares from anon, authenticated;
drop policy if exists "friendships_insert_requester" on public.friendships;
drop policy if exists "friendships_update_addressee" on public.friendships;
revoke insert, update on public.friendships from anon, authenticated;

-- No existing records, photos, or accepted connections are deleted.
commit;
