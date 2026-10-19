-- Independent Japanese tutor data. No changes to English tutor or journal records.
-- Apply once; safe to rerun. API access starts OFF for every account. No daily quotas.
begin;

create table if not exists public.japanese_tutor_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.japanese_tutor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default 'starter' check (level in ('starter','beginner','conversation')),
  improvements boolean not null default false
);
create table if not exists public.japanese_tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '일상 대화' check (char_length(title) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create table if not exists public.japanese_tutor_turns (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  content text not null check (char_length(content) between 1 and 1000),
  input_mode text not null check (input_mode in ('text','voice')),
  voice_confirmed boolean not null default false,
  level text not null check (level in ('starter','beginner','conversation')),
  improvements boolean not null default false,
  state text not null default 'pending' check (state in ('pending','completed','failed')),
  feedback jsonb,
  error_code text,
  reviewed_at timestamptz,
  usage_day date not null,
  charged_tokens integer not null default 0 check (charged_tokens >= 0),
  reported_tokens integer check (reported_tokens between 0 and 999999),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key(user_id,id),
  foreign key(session_id,user_id) references public.japanese_tutor_sessions(id,user_id) on delete cascade,
  check (input_mode <> 'voice' or voice_confirmed),
  check (state <> 'completed' or (feedback is not null and jsonb_typeof(feedback) = 'object'))
);
create table if not exists public.japanese_tutor_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  reported_tokens bigint not null default 0 check (reported_tokens >= 0),
  reported_requests integer not null default 0 check (reported_requests >= 0),
  last_request_at timestamptz not null default now(),
  primary key(user_id,day)
);
create index if not exists japanese_tutor_sessions_owner_updated on public.japanese_tutor_sessions(user_id,updated_at desc);
create index if not exists japanese_tutor_turns_session_order on public.japanese_tutor_turns(user_id,session_id,created_at desc,id);
create index if not exists japanese_tutor_turns_owner_order on public.japanese_tutor_turns(user_id,created_at desc);
create unique index if not exists japanese_tutor_one_pending_per_user on public.japanese_tutor_turns(user_id) where state='pending';

alter table public.japanese_tutor_access enable row level security;
alter table public.japanese_tutor_profiles enable row level security;
alter table public.japanese_tutor_sessions enable row level security;
alter table public.japanese_tutor_turns enable row level security;
alter table public.japanese_tutor_usage enable row level security;
revoke all on public.japanese_tutor_access,public.japanese_tutor_profiles,public.japanese_tutor_sessions,public.japanese_tutor_turns,public.japanese_tutor_usage from anon,authenticated;
grant select on public.japanese_tutor_access,public.japanese_tutor_profiles,public.japanese_tutor_sessions,public.japanese_tutor_turns,public.japanese_tutor_usage to authenticated;
grant all on public.japanese_tutor_access,public.japanese_tutor_profiles,public.japanese_tutor_sessions,public.japanese_tutor_turns,public.japanese_tutor_usage to service_role;
drop policy if exists japanese_tutor_access_self on public.japanese_tutor_access;
create policy japanese_tutor_access_self on public.japanese_tutor_access for select to authenticated using(user_id=auth.uid());
drop policy if exists japanese_tutor_profiles_self on public.japanese_tutor_profiles;
create policy japanese_tutor_profiles_self on public.japanese_tutor_profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists japanese_tutor_sessions_self on public.japanese_tutor_sessions;
create policy japanese_tutor_sessions_self on public.japanese_tutor_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists japanese_tutor_turns_self on public.japanese_tutor_turns;
create policy japanese_tutor_turns_self on public.japanese_tutor_turns for select to authenticated using(user_id=auth.uid());
drop policy if exists japanese_tutor_usage_self on public.japanese_tutor_usage;
create policy japanese_tutor_usage_self on public.japanese_tutor_usage for select to authenticated using(user_id=auth.uid());


alter table public.japanese_tutor_sessions add column if not exists topic_id text
  check (topic_id is null or topic_id ~ '^[a-z_]{2,40}$');
alter table public.japanese_tutor_sessions add column if not exists opening jsonb
  check (opening is null or (
    jsonb_typeof(opening) = 'object' and octet_length(opening::text) <= 2400
    and opening ?& array['question','question_reading','example','situation','role','level']
    and jsonb_typeof(opening->'question_reading') = 'object'
    and jsonb_typeof(opening->'example') = 'object'
    and opening->'question_reading' ?& array['sentence','reading_kana','pronunciation_ko','meaning_ko']
    and opening->'example' ?& array['sentence','reading_kana','pronunciation_ko','meaning_ko']
    and opening->'question_reading'->>'sentence' = opening->>'question'
    and jsonb_typeof(opening->'question') = 'string' and char_length(opening->>'question') between 1 and 600
    and jsonb_typeof(opening->'situation') = 'string' and char_length(opening->>'situation') <= 200
    and jsonb_typeof(opening->'role') = 'string' and char_length(opening->>'role') <= 100
    and jsonb_typeof(opening->'level') = 'string' and opening->>'level' in ('starter','beginner','conversation')
  ));


create or replace function public.japanese_tutor_create_session(p_user_id uuid,p_title text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.japanese_tutor_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:sessions:'||p_user_id::text));
  if not exists(select 1 from public.japanese_tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 80 then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from public.japanese_tutor_sessions where user_id=p_user_id)>=50 then raise exception 'TOO_MANY_SESSIONS'; end if;
  insert into public.japanese_tutor_sessions(user_id,title) values(p_user_id,trim(p_title)) returning * into s;
  return jsonb_build_object('id',s.id,'title',s.title,'created_at',s.created_at,'updated_at',s.updated_at);
end $$;

create or replace function public.japanese_tutor_delete_session(p_user_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  if exists(select 1 from public.japanese_tutor_turns where user_id=p_user_id and session_id=p_session_id and state='pending' and created_at>now()-interval '120 seconds') then raise exception 'REQUEST_BUSY'; end if;
  delete from public.japanese_tutor_sessions where user_id=p_user_id and id=p_session_id;
  -- Usage remains after deleting conversations.
end $$;

create or replace function public.japanese_tutor_start_topic(
  p_user_id uuid, p_session_id uuid, p_topic_id text, p_title text, p_opening jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.japanese_tutor_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:sessions:'||p_user_id::text));
  if not exists(select 1 from public.japanese_tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  if p_session_id is null or p_topic_id is null or p_topic_id !~ '^[a-z_]{2,40}$'
    or p_title is null or char_length(trim(p_title)) not between 1 and 80 or p_opening is null then raise exception 'INVALID_INPUT'; end if;
  select * into s from public.japanese_tutor_sessions where id=p_session_id;
  if found then
    if s.user_id<>p_user_id or s.topic_id is distinct from p_topic_id then raise exception 'REQUEST_CONFLICT'; end if;
  else
    if (select count(*) from public.japanese_tutor_sessions where user_id=p_user_id)>=50 then raise exception 'TOO_MANY_SESSIONS'; end if;
    insert into public.japanese_tutor_sessions(id,user_id,title,topic_id,opening)
      values(p_session_id,p_user_id,trim(p_title),p_topic_id,p_opening) returning * into s;
  end if;
  return jsonb_build_object('id',s.id,'title',s.title,'topic_id',s.topic_id,'opening',s.opening,'created_at',s.created_at,'updated_at',s.updated_at);
end $$;

create or replace function public.japanese_tutor_begin_turn(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_input_mode text, p_voice_confirmed boolean, p_global_limit integer default 100
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.japanese_tutor_access; t public.japanese_tutor_turns; p public.japanese_tutor_profiles;
  d date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  select * into a from public.japanese_tutor_access where user_id=p_user_id;
  if not found or not a.enabled then raise exception 'TUTOR_FORBIDDEN'; end if;
  if not exists(select 1 from public.japanese_tutor_sessions where id=p_session_id and user_id=p_user_id) then raise exception 'SESSION_NOT_FOUND'; end if;
  if p_content is null or char_length(trim(p_content)) not between 1 and 1000
     or p_input_mode is null or p_input_mode not in ('text','voice')
     or p_voice_confirmed is null or (p_input_mode='voice' and not p_voice_confirmed) then raise exception 'INVALID_INPUT'; end if;
  update public.japanese_tutor_turns set state='failed',error_code='REQUEST_EXPIRED',finished_at=now()
    where user_id=p_user_id and state='pending' and created_at < now()-interval '120 seconds';
  select * into t from public.japanese_tutor_turns where user_id=p_user_id and id=p_request_id;
  if found then
    if t.session_id<>p_session_id or t.content<>p_content or t.input_mode<>p_input_mode or t.voice_confirmed<>p_voice_confirmed then raise exception 'REQUEST_CONFLICT'; end if;
    return jsonb_build_object('fresh',false,'turn',to_jsonb(t));
  end if;
  if exists(select 1 from public.japanese_tutor_turns where user_id=p_user_id and state='pending') then raise exception 'REQUEST_BUSY'; end if;
  if (select count(*) from public.japanese_tutor_turns where user_id=p_user_id and session_id=p_session_id) >= 200 then raise exception 'SESSION_FULL'; end if;
  -- Cooldown spans midnight; there is no daily request or token ceiling.
  if exists(select 1 from public.japanese_tutor_usage where user_id=p_user_id and last_request_at>now()-interval '4 seconds') then raise exception 'RATE_LIMIT'; end if;
  insert into public.japanese_tutor_profiles(user_id) values(p_user_id) on conflict do nothing;
  select * into p from public.japanese_tutor_profiles where user_id=p_user_id;
  insert into public.japanese_tutor_usage(user_id,day,requests,tokens) values(p_user_id,d,1,0)
    on conflict(user_id,day) do update set requests=japanese_tutor_usage.requests+1,last_request_at=now();
  insert into public.japanese_tutor_turns(id,user_id,session_id,content,input_mode,voice_confirmed,level,improvements,usage_day,charged_tokens)
    values(p_request_id,p_user_id,p_session_id,p_content,p_input_mode,p_voice_confirmed,p.level,p.improvements,d,0) returning * into t;
  return jsonb_build_object('fresh',true,'turn',to_jsonb(t));
end $$;

create or replace function public.japanese_tutor_report_usage(p_user_id uuid,p_request_id uuid,p_tokens integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.japanese_tutor_turns;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  if p_tokens is null or p_tokens<0 or p_tokens>=1000000 then raise exception 'INVALID_INPUT'; end if;
  select * into t from public.japanese_tutor_turns where user_id=p_user_id and id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if t.reported_tokens is not null then return; end if;
  update public.japanese_tutor_usage set reported_tokens=reported_tokens+p_tokens,reported_requests=reported_requests+1,
    tokens=greatest(0,tokens-t.charged_tokens+p_tokens) where user_id=p_user_id and day=t.usage_day;
  update public.japanese_tutor_turns set reported_tokens=p_tokens,charged_tokens=p_tokens where user_id=p_user_id and id=p_request_id;
end $$;

create or replace function public.japanese_tutor_finish_turn(p_user_id uuid,p_request_id uuid,p_feedback jsonb,p_tokens integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.japanese_tutor_turns;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  select * into t from public.japanese_tutor_turns where user_id=p_user_id and id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if t.state='completed' then return to_jsonb(t); end if;
  if t.state<>'pending' or t.created_at<now()-interval '120 seconds' then raise exception 'REQUEST_EXPIRED'; end if;
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object' or octet_length(p_feedback::text)>18000
     or p_feedback->>'spec_version' is distinct from '1.0' then raise exception 'INVALID_MODEL_OUTPUT'; end if;
  if p_tokens is not null then perform public.japanese_tutor_report_usage(p_user_id,p_request_id,p_tokens); end if;
  update public.japanese_tutor_turns set state='completed',feedback=p_feedback,finished_at=now()
    where user_id=p_user_id and id=p_request_id returning * into t;
  update public.japanese_tutor_sessions set summary=left(coalesce(p_feedback->>'memory',''),600),updated_at=now() where id=t.session_id and user_id=p_user_id;
  return to_jsonb(t);
end $$;

create or replace function public.japanese_tutor_fail_turn(p_user_id uuid,p_request_id uuid,p_code text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  update public.japanese_tutor_turns set state='failed',error_code=left(p_code,60),finished_at=now()
    where user_id=p_user_id and id=p_request_id and state='pending';
  -- Unreported usage stays unknown. Never replace it with a reservation or fabricated zero.
end $$;

create or replace function public.japanese_tutor_set_access(p_actor_id uuid,p_target_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.japanese_tutor_access;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:japanese-tutor:budget'));
  if not exists(select 1 from public.profiles where id=p_actor_id and role in ('owner','admin')) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_enabled is null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from auth.users where id=p_target_id) then raise exception 'TARGET_USER_NOT_FOUND'; end if;
  insert into public.japanese_tutor_access(user_id,enabled,updated_by,updated_at) values(p_target_id,p_enabled,p_actor_id,now())
    on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at returning * into a;
  return jsonb_build_object('user_id',a.user_id,'enabled',a.enabled);
end $$;

create or replace function public.japanese_tutor_usage_summary(p_actor_id uuid,p_all_users boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; result jsonb;
begin
  if p_actor_id is null then raise exception 'INVALID_INPUT'; end if;
  if p_all_users and not exists(select 1 from public.profiles where id=p_actor_id and role in ('owner','admin')) then raise exception 'ADMIN_REQUIRED'; end if;
  with users as (
    select p_actor_id as user_id
    union select user_id from public.japanese_tutor_access where p_all_users
    union select user_id from public.japanese_tutor_usage where p_all_users
  ), totals as (
    select u.user_id,
      jsonb_build_object('requests',coalesce(sum(t.requests) filter(where t.day=d),0),
        'tokens',coalesce(sum(t.reported_tokens) filter(where t.day=d),0),
        'unreported',coalesce(sum(t.requests-t.reported_requests) filter(where t.day=d),0)) as today,
      jsonb_build_object('requests',coalesce(sum(t.requests),0),'tokens',coalesce(sum(t.reported_tokens),0),
        'unreported',coalesce(sum(t.requests-t.reported_requests),0)) as total
    from users u left join public.japanese_tutor_usage t on t.user_id=u.user_id group by u.user_id
  ) select coalesce(jsonb_agg(to_jsonb(totals) order by user_id),'[]'::jsonb) into result from totals;
  return jsonb_build_object('day',d,'users',result);
end $$;

revoke all on function public.japanese_tutor_create_session(uuid,text) from public,anon,authenticated;
grant execute on function public.japanese_tutor_create_session(uuid,text) to service_role;
revoke all on function public.japanese_tutor_delete_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.japanese_tutor_delete_session(uuid,uuid) to service_role;
revoke all on function public.japanese_tutor_start_topic(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.japanese_tutor_start_topic(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.japanese_tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.japanese_tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;
revoke all on function public.japanese_tutor_report_usage(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.japanese_tutor_report_usage(uuid,uuid,integer) to service_role;
revoke all on function public.japanese_tutor_finish_turn(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.japanese_tutor_finish_turn(uuid,uuid,jsonb,integer) to service_role;
revoke all on function public.japanese_tutor_fail_turn(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.japanese_tutor_fail_turn(uuid,uuid,text) to service_role;
revoke all on function public.japanese_tutor_set_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.japanese_tutor_set_access(uuid,uuid,boolean) to service_role;
revoke all on function public.japanese_tutor_usage_summary(uuid,boolean) from public,anon,authenticated;
grant execute on function public.japanese_tutor_usage_summary(uuid,boolean) to service_role;
commit;

