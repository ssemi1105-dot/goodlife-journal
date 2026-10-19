import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_PACKAGE || '@electric-sql/pglite');
const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const NEW_USER = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';

test('profile migration blocks privilege escalation while preserving profile edits and trusted administration', async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    insert into auth.users values ('${OWNER}'), ('${MEMBER}'), ('${NEW_USER}'), ('${OTHER_USER}');
    create table public.profiles (
      id uuid primary key references auth.users(id), display_name text default 'User',
      avatar_color text default '#2563eb', role text not null default 'member',
      created_at timestamptz default now(), updated_at timestamptz default now(),
      check (role in ('owner', 'admin', 'member', 'user'))
    );
    insert into profiles(id, role) values ('${OWNER}', 'owner'), ('${MEMBER}', 'member');
    grant all on public.profiles to authenticated, service_role;
    grant select, update on public.profiles to anon;
    grant update(role, id, created_at) on public.profiles to public, anon, authenticated;
    alter table profiles enable row level security;
    create policy profiles_select_self_or_owner on profiles for select
      using (id = auth.uid() or auth.uid() = '${OWNER}');
    create policy profiles_insert_self on profiles for insert with check (id = auth.uid());
    create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
  `);
  const original = (await pg.query('select * from profiles order by id')).rows;
  const sql = await readFile(new URL('../supabase/migrations/202610190005_enforce_profile_write_permissions.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql);
  assert.deepEqual((await pg.query('select * from profiles order by id')).rows, original);

  await t.test('table and leftover column grants are removed, not just hidden in the UI', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const column of ['role', 'id', 'created_at']) {
        const { rows } = await pg.query('select has_column_privilege($1, \'public.profiles\', $2, \'UPDATE\') as allowed', [role, column]);
        assert.equal(rows[0].allowed, false, `${role}.${column}`);
      }
    }
    for (const column of ['display_name', 'avatar_color', 'updated_at']) {
      assert.equal((await pg.query('select has_column_privilege(\'authenticated\', \'public.profiles\', $1, \'UPDATE\') as allowed', [column])).rows[0].allowed, true);
    }
  });

  await t.test('member and owner browser sessions cannot change roles, but can edit their own name', async () => {
    for (const id of [MEMBER, OWNER]) {
      await pg.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
      for (const role of ['owner', 'admin', 'member']) {
        await assert.rejects(pg.query('update profiles set role=$1 where id=$2', [role, id]), { code: '42501' });
      }
      await assert.rejects(pg.query('update profiles set id=$1 where id=$2', [NEW_USER, id]), { code: '42501' });
      await assert.rejects(pg.query('update profiles set created_at=now() where id=$1', [id]), { code: '42501' });
      const { rows } = await pg.query("update profiles set display_name='Updated', avatar_color='#123456', updated_at=now() where id=$1 returning id, role, display_name", [id]);
      assert.equal(rows[0].display_name, 'Updated');
      assert.equal(rows[0].role, id === OWNER ? 'owner' : 'member');
      await pg.exec('reset role');
    }
  });

  await t.test('restrictive policies block cross-user writes and privileged inserts even beside a permissive policy', async () => {
    await pg.exec(`create policy overly_broad_insert on profiles for insert to authenticated with check (true);
      create policy overly_broad_update on profiles for update to authenticated using (true) with check (true);
      set role authenticated; set request.jwt.claim.sub = '${OWNER}';`);
    assert.equal((await pg.query("update profiles set display_name='Wrong account' where id=$1 returning id", [MEMBER])).rows.length, 0);
    await pg.exec(`set request.jwt.claim.sub = '${NEW_USER}';`);
    for (const role of ['owner', 'admin']) {
      await assert.rejects(pg.query('insert into profiles(id, role) values ($1, $2)', [NEW_USER, role]), { code: '42501' });
    }
    await assert.rejects(pg.query('insert into profiles(id) values ($1)', [OTHER_USER]), { code: '42501' });
    const { rows } = await pg.query('insert into profiles(id) values ($1) returning role', [NEW_USER]);
    assert.equal(rows[0].role, 'member');
    await assert.rejects(pg.query("insert into profiles(id, role) values ($1, 'owner') on conflict(id) do update set role=excluded.role", [NEW_USER]), { code: '42501' });
    await pg.exec('reset role');
  });

  await t.test('anonymous writes fail and trusted server administration remains available', async () => {
    await pg.exec(`set role anon; set request.jwt.claim.sub = '';`);
    await assert.rejects(pg.query("update profiles set role='owner' where id=$1", [MEMBER]), { code: '42501' });
    await pg.exec('reset role; set role service_role;');
    assert.equal((await pg.query("update profiles set role='admin' where id=$1 returning role", [NEW_USER])).rows[0].role, 'admin');
    await pg.exec('reset role');
  });
});
