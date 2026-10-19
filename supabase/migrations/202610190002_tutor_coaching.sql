-- Apply after 202610190001_english_tutor.sql. Existing conversations remain unchanged.
begin;

alter table public.tutor_sessions add column if not exists topic_id text
  check (topic_id is null or topic_id ~ '^[a-z_]{2,40}$');
alter table public.tutor_sessions add column if not exists opening jsonb
  check (opening is null or (
    jsonb_typeof(opening) = 'object' and octet_length(opening::text) <= 2400
    and opening ?& array['question','situation','role','level']
    and jsonb_typeof(opening->'question') = 'string' and char_length(opening->>'question') between 1 and 600
    and jsonb_typeof(opening->'situation') = 'string' and char_length(opening->>'situation') <= 200
    and jsonb_typeof(opening->'role') = 'string' and char_length(opening->>'role') <= 100
    and jsonb_typeof(opening->'level') = 'string' and opening->>'level' in ('A2','B1','B1+')
  ));

-- No provider call or usage charge. A retry returns the same saved first question.
create or replace function public.tutor_start_topic(
  p_user_id uuid, p_session_id uuid, p_topic_id text, p_title text, p_opening jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.tutor_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('goodlife:tutor:sessions:'||p_user_id::text));
  if not exists(select 1 from public.tutor_access where user_id=p_user_id and enabled) then raise exception 'TUTOR_FORBIDDEN'; end if;
  if p_session_id is null or p_topic_id is null or p_topic_id !~ '^[a-z_]{2,40}$'
    or p_title is null or char_length(trim(p_title)) not between 1 and 80 or p_opening is null then raise exception 'INVALID_INPUT'; end if;
  select * into s from public.tutor_sessions where id=p_session_id;
  if found then
    if s.user_id<>p_user_id or s.topic_id is distinct from p_topic_id then raise exception 'REQUEST_CONFLICT'; end if;
  else
    if (select count(*) from public.tutor_sessions where user_id=p_user_id)>=50 then raise exception 'TOO_MANY_SESSIONS'; end if;
    insert into public.tutor_sessions(id,user_id,title,topic_id,opening)
      values(p_session_id,p_user_id,trim(p_title),p_topic_id,p_opening) returning * into s;
  end if;
  return jsonb_build_object('id',s.id,'title',s.title,'topic_id',s.topic_id,'opening',s.opening,'created_at',s.created_at,'updated_at',s.updated_at);
end $$;

revoke all on function public.tutor_start_topic(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tutor_start_topic(uuid,uuid,text,text,jsonb) to service_role;
commit;
