-- Goodlife Journal Supabase schema
-- Run this whole file in Supabase SQL Editor before using the app.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '사용자',
  avatar_color text not null default '#2563eb',
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'member', 'user'));

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null,
  occurred_on date not null default current_date,
  title text not null default '',
  amount numeric not null default 0,
  income_amount numeric not null default 0,
  rating numeric,
  visibility text not null default 'private' check (visibility in ('private', 'shared', 'public')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists records_user_date_idx on public.records(user_id, occurred_on desc);
create index if not exists records_category_idx on public.records(category_id);
create index if not exists records_visibility_idx on public.records(visibility);
create index if not exists records_data_gin_idx on public.records using gin(data);

create table if not exists public.app_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  category_order jsonb not null default '[]',
  hidden_categories jsonb not null default '[]',
  finance_modes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Future-ready sharing layer. The first app version keeps records private by default.
create table if not exists public.record_shares (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shared_with uuid references public.profiles(id) on delete cascade,
  share_scope text not null default 'user' check (share_scope in ('user', 'category_public')),
  can_compare boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists record_shares_record_idx on public.record_shares(record_id);
create index if not exists record_shares_shared_with_idx on public.record_shares(shared_with);

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

insert into storage.buckets (id, name, public)
values ('record-photos', 'record-photos', false)
on conflict (id) do update set public = false;

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.app_settings enable row level security;
alter table public.record_shares enable row level security;
alter table public.user_share_settings enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "profiles_select_self_or_owner" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create policy "profiles_select_self_or_owner"
  on public.profiles for select
  using (id = auth.uid() or public.is_owner());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "records_select_owner_or_shared" on public.records;
drop policy if exists "records_insert_self" on public.records;
drop policy if exists "records_update_self" on public.records;
drop policy if exists "records_delete_self" on public.records;

create policy "records_select_owner_or_shared"
  on public.records for select
  using (
    user_id = auth.uid()
    or visibility = 'public'
    or exists (
      select 1 from public.record_shares s
      where s.record_id = records.id
        and (s.shared_with = auth.uid() or s.share_scope = 'category_public')
    )
  );

create policy "records_insert_self"
  on public.records for insert
  with check (user_id = auth.uid());

create policy "records_update_self"
  on public.records for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "records_delete_self"
  on public.records for delete
  using (user_id = auth.uid());

drop policy if exists "settings_all_self" on public.app_settings;
create policy "settings_all_self"
  on public.app_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "shares_select_related" on public.record_shares;
drop policy if exists "shares_insert_owner" on public.record_shares;
drop policy if exists "shares_delete_owner" on public.record_shares;

create policy "shares_select_related"
  on public.record_shares for select
  using (owner_id = auth.uid() or shared_with = auth.uid());

create policy "shares_insert_owner"
  on public.record_shares for insert
  with check (owner_id = auth.uid());

create policy "shares_delete_owner"
  on public.record_shares for delete
  using (owner_id = auth.uid());

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

drop policy if exists "photos_select_own" on storage.objects;
drop policy if exists "photos_insert_own" on storage.objects;
drop policy if exists "photos_update_own" on storage.objects;
drop policy if exists "photos_delete_own" on storage.objects;

create policy "photos_select_own"
  on storage.objects for select
  using (
    bucket_id = 'record-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'record-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'record-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'record-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_count integer;
begin
  select count(*) into profile_count from public.profiles;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), '사용자'),
    case when profile_count = 0 then 'owner' else 'member' end
  )
  on conflict (id) do nothing;

  insert into public.app_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
