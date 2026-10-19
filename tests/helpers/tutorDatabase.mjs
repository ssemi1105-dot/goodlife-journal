import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export async function applyTutorUsageMigration(pg) {
  await pg.exec(await readFile(new URL('../../supabase/migrations/202610190003_tutor_usage.sql', import.meta.url), 'utf8'));
}
export async function createTutorDatabase({ usageMigration = true, japanese = false } = {}) {
  const { PGlite } = require(process.env.PGLITE_PACKAGE || '@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    insert into auth.users values('${USER_A}'),('${USER_B}');
    create table public.profiles(id uuid primary key references auth.users(id),role text not null default 'member',display_name text,avatar_color text,updated_at timestamptz default now());
    insert into public.profiles(id,role) values('${USER_A}','owner'),('${USER_B}','member');
    grant select on public.profiles to authenticated;
    grant update(display_name,avatar_color,updated_at) on public.profiles to authenticated;
    alter table public.profiles enable row level security;
    create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());`);
  const migration = await readFile(new URL('../../supabase/migrations/202610190001_english_tutor.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // The documented SQL can safely be re-run.
  const coachingMigration = await readFile(new URL('../../supabase/migrations/202610190002_tutor_coaching.sql', import.meta.url), 'utf8');
  await pg.exec(coachingMigration);
  await pg.exec(coachingMigration);
  if (usageMigration) { await applyTutorUsageMigration(pg); await applyTutorUsageMigration(pg); }
  if (japanese) {
    const sql = await readFile(new URL('../../supabase/migrations/202610190004_japanese_tutor.sql', import.meta.url), 'utf8');
    await pg.exec(sql); await pg.exec(sql);
  }
  await pg.exec(`insert into tutor_access(user_id,enabled) values('${USER_A}',true),('${USER_B}',true);
    insert into tutor_profiles(user_id) values('${USER_A}'),('${USER_B}');
    insert into tutor_sessions(id,user_id,title) values('${SESSION_A}','${USER_A}','오늘 하루'),('${SESSION_B}','${USER_B}','다른 사용자');`);
  const identifier = value => { if (!/^[a-z_]+$/.test(value)) throw new Error(`Unsafe test identifier ${value}`); return `"${value}"`; };
  function from(table) {
    const state = { op: 'select', columns: '*', where: [], order: [], params: [], limit: null, cardinality: '', options: {} };
    const param = value => { state.params.push(value); return `$${state.params.length}`; };
    const query = {
      select(columns = '*', options = {}) { state.columns = columns; state.options = options; return query; },
      eq(column, value) { state.where.push(`${identifier(column)}=${param(value)}`); return query; },
      order(column, options = {}) { state.order.push(`${identifier(column)} ${options.ascending === false ? 'desc' : 'asc'}`); return query; },
      limit(value) { state.limit = value; return query; },
      single() { state.cardinality = 'one'; return query; }, maybeSingle() { state.cardinality = 'maybe'; return query; },
      insert(value) { state.op = 'insert'; state.value = value; return query; },
      upsert(value, options = {}) { state.op = 'upsert'; state.value = value; state.upsert = options; return query; },
      update(value) { state.op = 'update'; state.value = value; return query; },
      delete() { state.op = 'delete'; return query; },
      then(resolve, reject) {
        return (async () => {
          try {
            const name = `public.${identifier(table)}`;
            const cols = state.columns === '*' ? '*' : state.columns.split(',').map(identifier).join(',');
            const where = state.where.length ? ` where ${state.where.join(' and ')}` : '';
            let sql;
            if (state.op === 'select') sql = `select ${state.options.count === 'exact' && state.options.head ? 'count(*)::int as count' : cols} from ${name}${where}${state.order.length ? ` order by ${state.order.join(',')}` : ''}${state.limit ? ` limit ${Number(state.limit)}` : ''}`;
            if (['insert', 'upsert'].includes(state.op)) {
              const entries = Object.entries(state.value);
              sql = `insert into ${name}(${entries.map(([key]) => identifier(key)).join(',')}) values(${entries.map(([, value]) => param(value)).join(',')})`;
              if (state.op === 'upsert') sql += ` on conflict(${identifier(state.upsert.onConflict)}) do ${state.upsert.ignoreDuplicates ? 'nothing' : `update set ${entries.map(([key]) => `${identifier(key)}=excluded.${identifier(key)}`).join(',')}`}`;
              sql += ` returning ${cols}`;
            }
            if (state.op === 'update') sql = `update ${name} set ${Object.entries(state.value).map(([key, value]) => `${identifier(key)}=${param(value)}`).join(',')}${where} returning ${cols}`;
            if (state.op === 'delete') sql = `delete from ${name}${where} returning ${cols}`;
            const result = await pg.query(sql, state.params);
            if (state.cardinality === 'one' && result.rows.length !== 1) throw new Error('Missing row');
            return { data: state.cardinality ? result.rows[0] || null : result.rows, count: state.options.count ? result.rows[0]?.count : null, error: null };
          } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
        })().then(resolve, reject);
      },
    };
    return query;
  }
  const client = {
    auth: { getUser: async token => [USER_A, USER_B].includes(token) ? { data: { user: { id: token } }, error: null } : { data: {}, error: new Error('invalid JWT') } },
    from,
    async rpc(name, params) {
      try {
        const keys = Object.keys(params);
        const result = await pg.query(`select public.${identifier(name)}(${keys.map((key, i) => `${identifier(key)}=>$${i + 1}`).join(',')}) as result`, Object.values(params));
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    },
  };
  return { pg, client, close: () => pg.close() };
}

export function feedbackFor(content = 'I ate apple.') {
  if (content === "can you recommended dinner menu it's with my wife") return {
    ...feedbackFor('Hello!'), corrected: "can you recommend a dinner menu it's with my wife",
    errors: [
      { type: 'verb_form', original: 'recommended', corrected: 'recommend', explanation_ko: 'can 뒤에는 동사원형을 씁니다.' },
      { type: 'article', original: 'dinner menu', corrected: 'a dinner menu', explanation_ko: '단수 명사 menu 앞에 관사가 필요합니다.' },
    ],
    natural: { sentence: "Can you recommend something for dinner? I'm having dinner with my wife.", explanation_ko: '먹을 음식은 something for dinner가 자연스럽고, 누구와 식사하는지 별도 문장으로 밝히면 명확합니다.' },
    tutor_reply: 'What kind of food do you and your wife enjoy?',
  };
  const error = content.includes('ate apple') ? [{ type: 'article', original: 'apple', corrected: 'an apple', explanation_ko: '셀 수 있는 단수 명사 앞에 관사가 필요해요.' }] : [];
  return { spec_version: '1.0', corrected: error.length ? content.replace('apple', 'an apple') : content,
    english_version: /[가-힣]/.test(content) ? 'I had a nice day today.' : null, errors: error, improvements: [],
    natural: error.length && !/[가-힣]/.test(content) ? { sentence: content.replace('apple', 'an apple'), explanation_ko: '관사를 넣으면 완성된 문장이 됩니다.' } : null,
    tutor_reply: 'That sounds nice. What did you enjoy most today?',
    level_signal: { observed_level: null, confidence: 'low', evidence_ko: '짧은 문장이라 판단을 보류해요.' },
    flags: { korean_input: /[가-힣]/.test(content), stt_suspected: false, off_topic: false, sensitive: false }, memory: 'Talked about today.' };
}
