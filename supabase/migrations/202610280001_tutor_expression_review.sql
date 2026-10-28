-- Additive: existing English/Japanese conversations and usage remain untouched.
begin;
create table if not exists public.tutor_study_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('en','ja')),
  source_key text not null check (char_length(source_key) between 1 and 120),
  phrase jsonb not null check (coalesce(jsonb_typeof(phrase)='object' and octet_length(phrase::text)<=8000
    and jsonb_typeof(phrase->'sentence')='string' and char_length(phrase->>'sentence') between 1 and 2000,false)),
  due_at timestamptz not null default now(),
  repetitions integer not null default 0 check (repetitions between 0 and 6),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,language,source_key)
);
create index if not exists tutor_study_due on public.tutor_study_items(user_id,language,due_at);
create table if not exists public.tutor_study_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.tutor_study_items(id) on delete cascade,
  grade text not null check (grade in ('again','hard','good')),
  created_at timestamptz not null default now()
);
alter table public.tutor_study_items enable row level security;
alter table public.tutor_study_reviews enable row level security;
drop policy if exists tutor_study_owner on public.tutor_study_items;
create policy tutor_study_owner on public.tutor_study_items for select to authenticated using(user_id=auth.uid());
drop policy if exists tutor_study_review_owner on public.tutor_study_reviews;
create policy tutor_study_review_owner on public.tutor_study_reviews for select to authenticated using(user_id=auth.uid());
revoke all on public.tutor_study_items,public.tutor_study_reviews from public,anon,authenticated;
grant select on public.tutor_study_items,public.tutor_study_reviews to authenticated;
grant all on public.tutor_study_items,public.tutor_study_reviews to service_role;

create or replace function public.tutor_study_check_access(p_user_id uuid,p_language text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_language is null or p_language not in ('en','ja') then raise exception 'INVALID_INPUT'; end if;
  if (p_language='en' and not exists(select 1 from tutor_access where user_id=p_user_id and enabled))
    or (p_language='ja' and not exists(select 1 from japanese_tutor_access where user_id=p_user_id and enabled)) then raise exception 'TUTOR_FORBIDDEN'; end if;
end $$;

create or replace function public.tutor_study_save(p_user_id uuid,p_language text,p_source_key text,p_phrase jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item tutor_study_items;
begin
  perform tutor_study_check_access(p_user_id,p_language);
  perform pg_advisory_xact_lock(hashtext('tutor-study:'||p_user_id::text||p_language));
  select * into item from tutor_study_items where user_id=p_user_id and language=p_language and source_key=p_source_key;
  if found then return to_jsonb(item)-'user_id'; end if;
  if (select count(*) from tutor_study_items where user_id=p_user_id and language=p_language)>=2000 then raise exception 'STUDY_FULL'; end if;
  insert into tutor_study_items(user_id,language,source_key,phrase) values(p_user_id,p_language,p_source_key,p_phrase) returning * into item;
  return to_jsonb(item)-'user_id';
end $$;

create or replace function public.tutor_study_grade(p_user_id uuid,p_language text,p_item_id uuid,p_request_id uuid,p_grade text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item tutor_study_items; previous tutor_study_reviews; days integer;
begin
  perform tutor_study_check_access(p_user_id,p_language);
  if p_request_id is null or p_grade is null or p_grade not in ('again','hard','good') then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtext('tutor-study:'||p_request_id::text));
  select * into item from tutor_study_items where id=p_item_id and user_id=p_user_id and language=p_language for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select * into previous from tutor_study_reviews where id=p_request_id;
  if found then
    if previous.user_id<>p_user_id or previous.item_id<>p_item_id or previous.grade<>p_grade then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(item)-'user_id';
  end if;
  days := (array[1,3,7,14,30,60])[least(item.repetitions+1,6)];
  update tutor_study_items set
    repetitions=case when p_grade='again' then 0 when p_grade='good' then least(repetitions+1,6) else repetitions end,
    due_at=now()+case when p_grade='again' then interval '10 minutes' when p_grade='hard' then interval '1 day' else make_interval(days=>days) end,
    last_reviewed_at=now() where id=item.id returning * into item;
  insert into tutor_study_reviews(id,user_id,item_id,grade) values(p_request_id,p_user_id,p_item_id,p_grade);
  return to_jsonb(item)-'user_id';
end $$;
revoke all on function public.tutor_study_check_access(uuid,text) from public,anon,authenticated;
revoke all on function public.tutor_study_save(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.tutor_study_grade(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tutor_study_check_access(uuid,text) to service_role;
grant execute on function public.tutor_study_save(uuid,text,text,jsonb) to service_role;
grant execute on function public.tutor_study_grade(uuid,text,uuid,uuid,text) to service_role;
commit;
