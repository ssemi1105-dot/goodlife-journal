create table if not exists public.user_share_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_key text not null,
  is_shared boolean not null default false,
  allow_friend_compare boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_key)
);

create index if not exists user_share_settings_category_idx
  on public.user_share_settings(category_key, is_shared);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  pair_low uuid not null references public.profiles(id) on delete cascade,
  pair_high uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_pair_order check (pair_low < pair_high),
  constraint friendships_unique_pair unique (pair_low, pair_high)
);

create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_status_idx on public.friendships(status);

alter table public.user_share_settings enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "share_settings_select_self_or_friend" on public.user_share_settings;
drop policy if exists "share_settings_insert_self" on public.user_share_settings;
drop policy if exists "share_settings_update_self" on public.user_share_settings;
drop policy if exists "share_settings_delete_self" on public.user_share_settings;

create policy "share_settings_select_self_or_friend"
  on public.user_share_settings for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = user_share_settings.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = user_share_settings.user_id)
        )
    )
  );

create policy "share_settings_insert_self"
  on public.user_share_settings for insert
  with check (user_id = auth.uid());

create policy "share_settings_update_self"
  on public.user_share_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "share_settings_delete_self"
  on public.user_share_settings for delete
  using (user_id = auth.uid());

drop policy if exists "friendships_select_related" on public.friendships;
drop policy if exists "friendships_insert_requester" on public.friendships;
drop policy if exists "friendships_update_addressee" on public.friendships;
drop policy if exists "friendships_delete_related" on public.friendships;

create policy "friendships_select_related"
  on public.friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_insert_requester"
  on public.friendships for insert
  with check (requester_id = auth.uid());

create policy "friendships_update_addressee"
  on public.friendships for update
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

create policy "friendships_delete_related"
  on public.friendships for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());
