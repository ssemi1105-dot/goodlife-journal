-- Tutor-only tables. Read existing profiles.role for admin authorization; never change it.
-- Existing records, sharing and storage are untouched.
begin;

create table if not exists public.tutor_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  daily_limit integer not null default 20 check (daily_limit between 1 and 100),
  daily_token_limit integer not null default 200000 check (daily_token_limit between 20000 and 1000000)
);
-- Also safe if the earlier tutor draft SQL was already applied.
alter table public.tutor_access add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.tutor_access add column if not exists updated_at timestamptz not null default now();
create table if not exists public.tutor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default 'A2' check (level in ('A2','B1','B1+')),
  improvements boolean not null default false
);
create table if not exists public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '일상 대화' check (char_length(title) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create table if not exists public.tutor_turns (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  content text not null check (char_length(content) between 1 and 1000),
  input_mode text not null check (input_mode in ('text','voice')),
  voice_confirmed boolean not null default false,
  level text not null check (level in ('A2','B1','B1+')),
  improvements boolean not null default false,
  state text not null default 'pending' check (state in ('pending','completed','failed')),
  feedback jsonb,
  error_code text,
  reviewed_at timestamptz,
  usage_day date not null,
  charged_tokens integer not null default 20000 check (charged_tokens >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key(user_id,id),
  foreign key(session_id,user_id) references public.tutor_sessions(id,user_id) on delete cascade,
  check (input_mode <> 'voice' or voice_confirmed),
  check (state <> 'completed' or (feedback is not null and jsonb_typeof(feedback) = 'object'))
);
create table if not exists public.tutor_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  last_request_at timestamptz not null default now(),
  primary key(user_id,day)
);
create index if not exists tutor_sessions_owner_updated on public.tutor_sessions(user_id,updated_at desc);
create index if not exists tutor_turns_session_order on public.tutor_turns(user_id,session_id,created_at desc,id);
create index if not exists tutor_turns_owner_order on public.tutor_turns(user_id,created_at desc);
create unique index if not exists tutor_one_pending_per_user on public.tutor_turns(user_id) where state='pending';

alter table public.tutor_access enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.tutor_sessions enable row level security;
alter table public.tutor_turns enable row level security;
alter table public.tutor_usage enable row level security;
revoke all on public.tutor_access,public.tutor_profiles,public.tutor_sessions,public.tutor_turns,public.tutor_usage from anon,authenticated;
grant select on public.tutor_access,public.tutor_profiles,public.tutor_sessions,public.tutor_turns,public.tutor_usage to authenticated;
grant all on public.tutor_access,public.tutor_profiles,public.tutor_sessions,public.tutor_turns,public.tutor_usage to service_role;
drop policy if exists tutor_access_self on public.tutor_access;
create policy tutor_access_self on public.tutor_access for select to authenticated using(user_id=auth.uid());
drop policy if exists tutor_profiles_self on public.tutor_profiles;
create policy tutor_profiles_self on public.tutor_profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists tutor_sessions_self on public.tutor_sessions;
create policy tutor_sessions_self on public.tutor_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists tutor_turns_self on public.tutor_turns;
create policy tutor_turns_self on public.tutor_turns for select to authenticated using(user_id=auth.uid());
drop policy if exists tutor_usage_self on public.tutor_usage;
create policy tutor_usage_self on public.tutor_usage for select to authenticated using(user_id=auth.uid());

create or replace function public.tutor_set_access(p_actor_id uuid,p_target_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.tutor_access;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  if not exists(select 1 from public.profiles where id=p_actor_id and role in ('owner','admin')) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_enabled is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from auth.users where id=p_target_id) then raise exception 'TARGET_USER_NOT_FOUND'; end if;
  insert into public.tutor_access(user_id,enabled,updated_by,updated_at) values(p_target_id,p_enabled,p_actor_id,now())
    on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at returning * into a;
  return jsonb_build_object('user_id',a.user_id,'enabled',a.enabled,'daily_limit',a.daily_limit);
end $$;

create or replace function public.tutor_create_session(p_user_id uuid,p_title text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.tutor_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:sessions:'||p_user_id::text));
  if not exists(select 1 from public.tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 80 then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from public.tutor_sessions where user_id=p_user_id)>=50 then raise exception 'TOO_MANY_SESSIONS'; end if;
  insert into public.tutor_sessions(user_id,title) values(p_user_id,trim(p_title)) returning * into s;
  return jsonb_build_object('id',s.id,'title',s.title,'created_at',s.created_at,'updated_at',s.updated_at);
end $$;

-- Atomic authorization, idempotency and budget reservation BEFORE any paid request.
-- Caller is the Edge Function's service_role, never a browser-provided user id.
create or replace function public.tutor_begin_turn(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_input_mode text, p_voice_confirmed boolean, p_global_limit integer default 100
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.tutor_access; t public.tutor_turns; u public.tutor_usage; p public.tutor_profiles;
  d date := (now() at time zone 'Asia/Seoul')::date;
  global_count bigint;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  select * into a from public.tutor_access where user_id=p_user_id;
  if not found or not a.enabled then raise exception 'TUTOR_FORBIDDEN'; end if;
  if not exists(select 1 from public.tutor_sessions where id=p_session_id and user_id=p_user_id) then raise exception 'SESSION_NOT_FOUND'; end if;
  if p_content is null or char_length(trim(p_content)) not between 1 and 1000
     or p_input_mode is null or p_input_mode not in ('text','voice')
     or p_voice_confirmed is null or (p_input_mode='voice' and not p_voice_confirmed) then raise exception 'INVALID_INPUT'; end if;
  update public.tutor_turns set state='failed',error_code='REQUEST_EXPIRED',finished_at=now()
    where user_id=p_user_id and state='pending' and created_at < now()-interval '120 seconds';
  select * into t from public.tutor_turns where user_id=p_user_id and id=p_request_id;
  if found then
    if t.session_id<>p_session_id or t.content<>p_content or t.input_mode<>p_input_mode or t.voice_confirmed<>p_voice_confirmed then raise exception 'REQUEST_CONFLICT'; end if;
    return jsonb_build_object('fresh',false,'turn',to_jsonb(t));
  end if;
  if exists(select 1 from public.tutor_turns where user_id=p_user_id and state='pending') then raise exception 'REQUEST_BUSY'; end if;
  if (select count(*) from public.tutor_turns where user_id=p_user_id and session_id=p_session_id) >= 200 then raise exception 'SESSION_FULL'; end if;
  select * into u from public.tutor_usage where user_id=p_user_id and day=d;
  if found then
    if u.requests >= a.daily_limit or u.tokens+20000>a.daily_token_limit then raise exception 'DAILY_LIMIT'; end if;
    if u.last_request_at > now()-interval '4 seconds' then raise exception 'RATE_LIMIT'; end if;
  end if;
  select coalesce(sum(requests),0) into global_count from public.tutor_usage where day=d;
  if global_count >= greatest(1,least(coalesce(p_global_limit,100),1000)) then raise exception 'GLOBAL_LIMIT'; end if;
  insert into public.tutor_profiles(user_id) values(p_user_id) on conflict do nothing;
  select * into p from public.tutor_profiles where user_id=p_user_id;
  insert into public.tutor_usage(user_id,day,requests,tokens) values(p_user_id,d,1,20000)
    on conflict(user_id,day) do update set requests=tutor_usage.requests+1,tokens=tutor_usage.tokens+20000,last_request_at=now();
  insert into public.tutor_turns(id,user_id,session_id,content,input_mode,voice_confirmed,level,improvements,usage_day)
    values(p_request_id,p_user_id,p_session_id,p_content,p_input_mode,p_voice_confirmed,p.level,p.improvements,d) returning * into t;
  return jsonb_build_object('fresh',true,'turn',to_jsonb(t));
end $$;

create or replace function public.tutor_finish_turn(p_user_id uuid,p_request_id uuid,p_feedback jsonb,p_tokens integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tutor_turns; actual integer;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  select * into t from public.tutor_turns where user_id=p_user_id and id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if t.state='completed' then return to_jsonb(t); end if;
  if t.state<>'pending' or t.created_at<now()-interval '120 seconds' then raise exception 'REQUEST_EXPIRED'; end if;
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object' or octet_length(p_feedback::text)>18000
     or p_feedback->>'spec_version' is distinct from '1.0' then raise exception 'INVALID_MODEL_OUTPUT'; end if;
  actual := case when p_tokens is null or p_tokens<1 then 20000 else p_tokens end;
  update public.tutor_usage set tokens=greatest(0,tokens-t.charged_tokens+actual) where user_id=p_user_id and day=t.usage_day;
  update public.tutor_turns set state='completed',feedback=p_feedback,charged_tokens=actual,finished_at=now()
    where user_id=p_user_id and id=p_request_id returning * into t;
  update public.tutor_sessions set summary=left(coalesce(p_feedback->>'memory',''),600),updated_at=now() where id=t.session_id and user_id=p_user_id;
  return to_jsonb(t);
end $$;

create or replace function public.tutor_fail_turn(p_user_id uuid,p_request_id uuid,p_code text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  update public.tutor_turns set state='failed',error_code=left(p_code,60),finished_at=now()
    where user_id=p_user_id and id=p_request_id and state='pending';
  -- Failed/uncertain provider calls keep the reservation: retries cannot evade limits.
end $$;

create or replace function public.tutor_delete_session(p_user_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  if exists(select 1 from public.tutor_turns where user_id=p_user_id and session_id=p_session_id and state='pending' and created_at>now()-interval '120 seconds') then raise exception 'REQUEST_BUSY'; end if;
  delete from public.tutor_sessions where user_id=p_user_id and id=p_session_id;
  -- Usage remains; deleting conversations must not reset a paid-call allowance.
end $$;

revoke all on function public.tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.tutor_set_access(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.tutor_create_session(uuid,text) from public,anon,authenticated;
revoke all on function public.tutor_finish_turn(uuid,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.tutor_fail_turn(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.tutor_delete_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;
grant execute on function public.tutor_set_access(uuid,uuid,boolean) to service_role;
grant execute on function public.tutor_create_session(uuid,text) to service_role;
grant execute on function public.tutor_finish_turn(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.tutor_fail_turn(uuid,uuid,text) to service_role;
grant execute on function public.tutor_delete_session(uuid,uuid) to service_role;
commit;
