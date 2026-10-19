-- Remove daily quotas; retain authorization, idempotency and short request cooldowns.
-- Existing records and learner conversations are not changed or exposed to admins.
begin;

alter table public.tutor_turns add column if not exists reported_tokens integer check (reported_tokens between 0 and 1000000);
alter table public.tutor_turns alter column charged_tokens set default 0;
alter table public.tutor_usage add column if not exists reported_tokens bigint check (reported_tokens >= 0);
alter table public.tutor_usage add column if not exists reported_requests integer check (reported_requests >= 0);

-- Old completed calls with 20,000 tokens are ambiguous (actual or reserved).
-- Deleted turns cannot be reconstructed. Leave those requests unreported, not zero-cost.
-- NULL on the daily row is the one-time migration marker, so reruns preserve new counts.
update public.tutor_turns t set reported_tokens=t.charged_tokens
  from public.tutor_usage u
  where u.user_id=t.user_id and u.day=t.usage_day and u.reported_requests is null
    and t.state='completed' and t.charged_tokens>0 and t.charged_tokens<>20000
    and t.charged_tokens<1000000 and t.reported_tokens is null;
update public.tutor_usage u set
  reported_tokens=(select coalesce(sum(t.reported_tokens),0) from public.tutor_turns t where t.user_id=u.user_id and t.usage_day=u.day),
  reported_requests=(select count(t.reported_tokens) from public.tutor_turns t where t.user_id=u.user_id and t.usage_day=u.day)
  where u.reported_requests is null;
alter table public.tutor_usage alter column reported_tokens set default 0;
alter table public.tutor_usage alter column reported_tokens set not null;
alter table public.tutor_usage alter column reported_requests set default 0;
alter table public.tutor_usage alter column reported_requests set not null;
comment on column public.tutor_usage.tokens is 'Legacy usage including old reservations. Use reported_tokens for confirmed provider usage.';
comment on column public.tutor_access.daily_limit is 'Deprecated: not enforced after 202610190003.';
comment on column public.tutor_access.daily_token_limit is 'Deprecated: not enforced after 202610190003.';

-- Keep the old signature for safe rolling deployment; p_global_limit is ignored.
create or replace function public.tutor_begin_turn(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_input_mode text, p_voice_confirmed boolean, p_global_limit integer default 100
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.tutor_access; t public.tutor_turns; p public.tutor_profiles;
  d date := (now() at time zone 'Asia/Seoul')::date;
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
  -- Cooldown spans midnight; there is no daily request or token ceiling.
  if exists(select 1 from public.tutor_usage where user_id=p_user_id and last_request_at>now()-interval '4 seconds') then raise exception 'RATE_LIMIT'; end if;
  insert into public.tutor_profiles(user_id) values(p_user_id) on conflict do nothing;
  select * into p from public.tutor_profiles where user_id=p_user_id;
  insert into public.tutor_usage(user_id,day,requests,tokens) values(p_user_id,d,1,0)
    on conflict(user_id,day) do update set requests=tutor_usage.requests+1,last_request_at=now();
  insert into public.tutor_turns(id,user_id,session_id,content,input_mode,voice_confirmed,level,improvements,usage_day,charged_tokens)
    values(p_request_id,p_user_id,p_session_id,p_content,p_input_mode,p_voice_confirmed,p.level,p.improvements,d,0) returning * into t;
  return jsonb_build_object('fresh',true,'turn',to_jsonb(t));
end $$;

-- Record provider-reported usage independently of whether feedback validation succeeds.
-- One settlement per request; retries and lost commit responses cannot double-count.
create or replace function public.tutor_report_usage(p_user_id uuid,p_request_id uuid,p_tokens integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tutor_turns;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  if p_tokens is null or p_tokens<0 or p_tokens>=1000000 then raise exception 'INVALID_INPUT'; end if;
  select * into t from public.tutor_turns where user_id=p_user_id and id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if t.reported_tokens is not null then return; end if;
  update public.tutor_usage set reported_tokens=reported_tokens+p_tokens,reported_requests=reported_requests+1,
    tokens=greatest(0,tokens-t.charged_tokens+p_tokens) where user_id=p_user_id and day=t.usage_day;
  update public.tutor_turns set reported_tokens=p_tokens,charged_tokens=p_tokens where user_id=p_user_id and id=p_request_id;
end $$;

create or replace function public.tutor_finish_turn(p_user_id uuid,p_request_id uuid,p_feedback jsonb,p_tokens integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tutor_turns;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  select * into t from public.tutor_turns where user_id=p_user_id and id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if t.state='completed' then return to_jsonb(t); end if;
  if t.state<>'pending' or t.created_at<now()-interval '120 seconds' then raise exception 'REQUEST_EXPIRED'; end if;
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object' or octet_length(p_feedback::text)>18000
     or p_feedback->>'spec_version' is distinct from '1.0' then raise exception 'INVALID_MODEL_OUTPUT'; end if;
  if p_tokens is not null then perform public.tutor_report_usage(p_user_id,p_request_id,p_tokens); end if;
  update public.tutor_turns set state='completed',feedback=p_feedback,finished_at=now()
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
  -- Unreported usage stays unknown. Never replace it with a reservation or fabricated zero.
end $$;

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
  return jsonb_build_object('user_id',a.user_id,'enabled',a.enabled);
end $$;

-- Service-only: actor id must come from the JWT verified by the Edge Function.
-- Admin access is limited to counters, NOT private conversation content.
create or replace function public.tutor_usage_summary(p_actor_id uuid,p_all_users boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; result jsonb;
begin
  if p_actor_id is null then raise exception 'INVALID_INPUT'; end if;
  if p_all_users and not exists(select 1 from public.profiles where id=p_actor_id and role in ('owner','admin')) then raise exception 'ADMIN_REQUIRED'; end if;
  with users as (
    select p_actor_id as user_id
    union select user_id from public.tutor_access where p_all_users
    union select user_id from public.tutor_usage where p_all_users
  ), totals as (
    select u.user_id,
      jsonb_build_object('requests',coalesce(sum(t.requests) filter(where t.day=d),0),
        'tokens',coalesce(sum(t.reported_tokens) filter(where t.day=d),0),
        'unreported',coalesce(sum(t.requests-t.reported_requests) filter(where t.day=d),0)) as today,
      jsonb_build_object('requests',coalesce(sum(t.requests),0),'tokens',coalesce(sum(t.reported_tokens),0),
        'unreported',coalesce(sum(t.requests-t.reported_requests),0)) as total
    from users u left join public.tutor_usage t on t.user_id=u.user_id group by u.user_id
  ) select coalesce(jsonb_agg(to_jsonb(totals) order by user_id),'[]'::jsonb) into result from totals;
  return jsonb_build_object('day',d,'users',result);
end $$;

-- RLS remains self-only, even for admin browser sessions. No client can write counters.
revoke all on function public.tutor_report_usage(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.tutor_usage_summary(uuid,boolean) from public,anon,authenticated;
grant execute on function public.tutor_report_usage(uuid,uuid,integer) to service_role;
grant execute on function public.tutor_usage_summary(uuid,boolean) to service_role;
revoke all on function public.tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.tutor_finish_turn(uuid,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.tutor_fail_turn(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.tutor_set_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.tutor_begin_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;
grant execute on function public.tutor_finish_turn(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.tutor_fail_turn(uuid,uuid,text) to service_role;
grant execute on function public.tutor_set_access(uuid,uuid,boolean) to service_role;
commit;
