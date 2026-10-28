-- English tutor only. Run after the coaching and usage migrations.
-- No conversations are deleted: old empty sessions are simply absent from history.
begin;

create or replace function public.tutor_session_history(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not exists(select 1 from public.tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.last_message_at desc,h.id), '[]'::jsonb) into result
  from (
    select s.id,s.title,s.created_at,s.updated_at,t.last_message_at,t.message_count,
      (select left(first_turn.content,120) from public.tutor_turns first_turn
       where first_turn.session_id=s.id and first_turn.user_id=p_user_id
       order by first_turn.created_at,first_turn.id limit 1) as preview
    from public.tutor_sessions s
    join lateral (
      select max(created_at) as last_message_at,count(*)::integer as message_count
      from public.tutor_turns where session_id=s.id and user_id=p_user_id
    ) t on t.message_count>0
    where s.user_id=p_user_id
    order by t.last_message_at desc,s.id limit 50
  ) h;
  return result;
end $$;

-- Materialize the draft and its first message in one transaction. Rejected sends
-- roll back the session too; retried request IDs never generate another AI call.
create or replace function public.tutor_begin_session_turn(
  p_user_id uuid,p_session_id uuid,p_request_id uuid,p_content text,
  p_input_mode text,p_voice_confirmed boolean,p_title text,p_topic_id text,p_opening jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.tutor_sessions; started jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:budget'));
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:sessions:'||p_user_id::text));
  if not exists(select 1 from public.tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  if p_session_id is null or p_title is null or char_length(trim(p_title)) not between 1 and 80
    or (p_topic_id is not null and (p_topic_id !~ '^[a-z_]{2,40}$' or p_opening is null))
    or (p_topic_id is null and p_opening is not null) then raise exception 'INVALID_INPUT'; end if;
  select * into s from public.tutor_sessions where id=p_session_id;
  if found then
    if s.user_id<>p_user_id or s.topic_id is distinct from p_topic_id then raise exception 'REQUEST_CONFLICT'; end if;
  else
    if (select count(*) from public.tutor_sessions existing where existing.user_id=p_user_id
      and exists(select 1 from public.tutor_turns t where t.session_id=existing.id and t.user_id=p_user_id))>=50
      then raise exception 'TOO_MANY_SESSIONS'; end if;
    insert into public.tutor_sessions(id,user_id,title,topic_id,opening)
      values(p_session_id,p_user_id,trim(p_title),p_topic_id,p_opening) returning * into s;
  end if;
  started := public.tutor_begin_turn(p_user_id,p_session_id,p_request_id,p_content,p_input_mode,p_voice_confirmed);
  return jsonb_build_object('session',to_jsonb(s),'begin',started);
end $$;

revoke all on function public.tutor_session_history(uuid) from public,anon,authenticated;
revoke all on function public.tutor_begin_session_turn(uuid,uuid,uuid,text,text,boolean,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tutor_session_history(uuid) to service_role;
grant execute on function public.tutor_begin_session_turn(uuid,uuid,uuid,text,text,boolean,text,text,jsonb) to service_role;
commit;
