import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Only use a disposable PostgreSQL instance; never run fixture setup on the app database.
const connection = process.env['CONTRACT_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1','localhost'].includes(target.hostname) || !target.pathname.startsWith('/contract_')) {
    throw new Error('Contract fixtures require a fresh local database named contract_*');
  }
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;
type Fixture = { owner: string; member: string; outsider: string; artist: string; other: string; booking: string; own: string; active: string; inactive: string; higher: string };
const rollback = new Error('rollback contract fixtures');

async function fixture(run: (tx: TransactionSql, f: Fixture) => Promise<void>) {
  if (!db) throw new Error('CONTRACT_TEST_DATABASE_URL is required for database regression tests');
  try {
    await db.begin(async (tx) => {
      const f: Fixture = { owner: randomUUID(), member: randomUUID(), outsider: randomUUID(), artist: randomUUID(), other: randomUUID(), booking: randomUUID(), own: randomUUID(), active: randomUUID(), inactive: randomUUID(), higher: randomUUID() };
      await tx`insert into public.artists (id,user_id,slug,stage_name) values (${f.artist},${f.owner},${f.artist},'Contract Test Artist'),(${f.other},${f.outsider},${f.other},'Other Contract Artist')`;
      await tx`insert into public.artist_members (artist_id,email,user_id,role,status) values (${f.artist},${`${f.member}@example.invalid`},${f.member},'member','active')`;
      const clauses = [{ title: '{artist} / {client}', body: '{service}|{date}|{time}|{venue}|{total}|{vat}' }];
      await tx`insert into public.contract_templates (id,artist_id,name,clauses,rider) values (${f.own},${f.artist},'Own',${tx.json(clauses)},'Water for {artist}')`;
      await tx`insert into public.contract_templates (id,name,tier,is_active,clauses) values (${f.active},'Active','free',true,${tx.json(clauses)}),(${f.inactive},'Inactive','free',false,${tx.json(clauses)}),(${f.higher},'Higher','pro',true,${tx.json(clauses)})`;
      await tx`insert into public.bookings (id,artist_id,client_name,event_date,amount,vat_amount,total,status,package_title,start_time,end_time,notes) values (${f.booking},${f.artist},'Test Client','2026-12-09',1000,50,1050,'quoted','Live vocals','18:00','19:00',E'Other note\nVenue / emirate: Dubai Opera\nFinal note')`;
      await run(tx, f);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function asUser(tx: TransactionSql, user: string) {
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  await tx.unsafe('SET LOCAL ROLE authenticated');
}

async function rejects(tx: TransactionSql, operation: (s: TransactionSql) => Promise<unknown>, message: string) {
  await expect(tx.savepoint(operation)).rejects.toThrow(message);
}

afterAll(async () => { await db?.end(); });

describe.skipIf(!connection)('contract templates database rules (rollback-only fixtures)', () => {
  beforeAll(async () => {
    if (!db) throw new Error('Missing isolated database');
    await db.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
      END $$;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
      CREATE TYPE public.app_role AS ENUM ('admin','artist','client');
      CREATE TABLE public.user_roles (user_id uuid,role public.app_role);
      CREATE TABLE public.plan_tiers (code text PRIMARY KEY,sort int);
      INSERT INTO public.plan_tiers VALUES ('free',1),('basic',2),('medium',3),('pro',4);
      CREATE TABLE public.artists (id uuid PRIMARY KEY,user_id uuid,slug text,stage_name text);
      CREATE TABLE public.artist_subscriptions (artist_id uuid,plan_code text,environment text,paid_until timestamptz,status text);
      CREATE TABLE public.artist_members (artist_id uuid,email text,user_id uuid,role text,status text);
      CREATE TABLE public.bookings (id uuid PRIMARY KEY,artist_id uuid,client_name text,event_date date,amount numeric,vat_amount numeric,total numeric,status text,package_title text,job_detail text,start_time time,end_time time,notes text,contract_accepted_at timestamptz);
      CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
      CREATE FUNCTION public.is_artist_owner(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.artists WHERE id=_artist AND user_id=auth.uid()) $$;
      CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_artist_owner(_artist) OR EXISTS(SELECT 1 FROM public.artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active') $$;
      CREATE FUNCTION public.is_any_artist_team() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.artists WHERE user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.artist_members WHERE user_id=auth.uid() AND status='active') $$;
      CREATE FUNCTION public.effective_artist_plan(_artist uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT s.plan_code FROM artist_subscriptions s WHERE s.artist_id=_artist AND s.environment='sandbox' AND s.paid_until>now() AND s.status IN ('active','trialing','past_due','canceled','unpaid') ORDER BY s.paid_until DESC LIMIT 1),'free') $$;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.bookings TO authenticated;
      ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY booking_team_test ON public.bookings TO authenticated USING(public.is_artist_team(artist_id)) WITH CHECK(public.is_artist_team(artist_id));
    `);
    await db.unsafe(readFileSync('drizzle/migrations/0048_contract_templates_and_frozen_booking_terms.sql','utf8'));
    const source = JSON.parse(readFileSync('docs/contract-seeds/templates.json','utf8')) as { templates: Array<Record<string, unknown>> };
    for (const t of source.templates) {
      await db`insert into public.contract_templates (name,category,role,description,tier,clauses,rider,is_active) values (${String(t['name'])},${String(t['category'])},${String(t['role'])},${String(t['description'])},${String(t['tier'])},${db.json(t['clauses'] as Array<{title:string;body:string}>)},${String(t['rider'])},false)`;
    }
    await db`insert into public.user_roles (user_id,role) values (${randomUUID()},'admin')`;
  });

  it('seeds exactly the eight repository library templates inactive without storing slugs', async () => {
    if (!db) throw new Error('Missing database');
    const source = JSON.parse(readFileSync('docs/contract-seeds/templates.json', 'utf8')) as { templates: Array<Record<string, unknown>> };
    expect(source.templates).toHaveLength(8);
    for (const t of source.templates) {
      const rows = await db`select name,category,role,description,tier,clauses,rider,is_active from public.contract_templates where artist_id is null and name=${String(t['name'])}`;
      expect(rows).toHaveLength(1);
      const { slug: _slug, is_active: _active, ...expected } = t;
      expect(rows[0]).toEqual({ ...expected, is_active: false });
    }
    const columns = await db`select column_name from information_schema.columns where table_schema='public' and table_name='contract_templates' and column_name='slug'`;
    expect(columns).toHaveLength(0);
  });

  it('allows ten personal templates and rejects the eleventh', () => fixture(async (tx,f) => {
    for (let i=1; i<10; i++) await tx`insert into public.contract_templates (artist_id,name) values (${f.artist},${`Own ${i}`})`;
    const [row] = await tx`select count(*)::int as count from public.contract_templates where artist_id=${f.artist}`;
    expect(row?.['count']).toBe(10);
    await rejects(tx,s => s`insert into public.contract_templates (artist_id,name) values (${f.artist},'Eleventh')`,'at most 10');
  }));

  it('artist teams read active library and their own inactive templates, not another artist templates', () => fixture(async (tx,f) => {
    await tx`update public.contract_templates set is_active=false where id=${f.own}`;
    await tx`insert into public.contract_templates (artist_id,name) values (${f.other},'Private other')`;
    await asUser(tx,f.member);
    const rows = await tx`select id from public.contract_templates`;
    const ids = rows.map(r => r['id']);
    expect(ids).toContain(f.active); expect(ids).toContain(f.own);
    expect(ids).not.toContain(f.inactive);
    expect(await tx`select id from public.contract_templates where artist_id=${f.other}`).toHaveLength(0);
  }));

  it('owners create edit and delete only personal templates', () => fixture(async (tx,f) => {
    await asUser(tx,f.owner);
    const [created] = await tx`insert into public.contract_templates (artist_id,name) values (${f.artist},'Editable') returning id`;
    const id = String(created?.['id']);
    expect(await tx`update public.contract_templates set name='Edited' where id=${id} returning id`).toHaveLength(1);
    expect(await tx`delete from public.contract_templates where id=${id} returning id`).toHaveLength(1);
    await rejects(tx,s => s`insert into public.contract_templates (name) values ('Library takeover')`,'row-level security');
    expect(await tx`update public.contract_templates set name='Hijacked' where id=${f.active} returning id`).toHaveLength(0);
    expect(await tx`delete from public.contract_templates where id=${f.active} returning id`).toHaveLength(0);
    await rejects(tx,s => s`update public.contract_templates set artist_id=null where id=${f.own}`,'row-level security');
  }));

  it('team members cannot write personal templates or select booking templates', () => fixture(async (tx,f) => {
    await asUser(tx,f.member);
    await rejects(tx,s => s`insert into public.contract_templates (artist_id,name) values (${f.artist},'Forbidden')`,'row-level security');
    expect(await tx`update public.contract_templates set name='Forbidden' where id=${f.own} returning id`).toHaveLength(0);
    expect(await tx`delete from public.contract_templates where id=${f.own} returning id`).toHaveLength(0);
    await rejects(tx,s => s`select public.use_contract_template(${f.booking},${f.own})`,'Only the artist owner');
    await rejects(tx,s => s`update public.bookings set contract_template_id=${f.own} where id=${f.booking}`,'Only the artist owner');
  }));

  it('owners can select personal or eligible active library templates and clear selection', () => fixture(async (tx,f) => {
    await tx`update public.contract_templates set tier='pro',is_active=false where id=${f.own}`;
    await asUser(tx,f.owner);
    await tx`select public.use_contract_template(${f.booking},${f.own})`;
    await tx`select public.use_contract_template(${f.booking},${f.active})`;
    await tx`select public.use_contract_template(${f.booking},null)`;
    const [row] = await tx`select contract_template_id from public.bookings where id=${f.booking}`;
    expect(row?.['contract_template_id']).toBeNull();
  }));

  it('rejects inactive and above-plan library templates and another artist personal template', () => fixture(async (tx,f) => {
    const [other] = await tx`insert into public.contract_templates (artist_id,name) values (${f.other},'Other') returning id`;
    await asUser(tx,f.owner);
    for (const id of [f.inactive,f.higher,String(other?.['id']),randomUUID()]) {
      await rejects(tx,s => s`select public.use_contract_template(${f.booking},${id})`,'unavailable for this artist plan');
    }
  }));

  it('uses effective subscription rank, allowing equal and lower library tiers', () => fixture(async (tx,f) => {
    await tx`insert into public.artist_subscriptions (artist_id,plan_code,environment,paid_until,status) values (${f.artist},'pro','sandbox',now()+interval '1 month','active')`;
    await asUser(tx,f.owner);
    await tx`select public.use_contract_template(${f.booking},${f.higher})`;
    const [equal] = await tx`select contract_template_id from public.bookings where id=${f.booking}`;
    expect(equal?.['contract_template_id']).toBe(f.higher);
    await tx`select public.use_contract_template(${f.booking},${f.active})`;
    const [lower] = await tx`select contract_template_id from public.bookings where id=${f.booking}`;
    expect(lower?.['contract_template_id']).toBe(f.active);
  }));

  it('previews every placeholder from real booking values for artist team members', () => fixture(async (tx,f) => {
    await asUser(tx,f.owner); await tx`select public.use_contract_template(${f.booking},${f.own})`;
    await asUser(tx,f.member);
    const [row] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    expect(row?.['terms']).toEqual({ clauses:[{title:'Contract Test Artist / Test Client',body:'Live vocals|2026-12-09|18:00 - 19:00|Dubai Opera|AED 1050.00|AED 50.00'}],rider:'Water for Contract Test Artist' });
  }));

  it('resolves missing venue and time to empty strings without recursively replacing client text', () => fixture(async (tx,f) => {
    await tx`update public.bookings set notes=null,start_time=null,end_time=null,client_name='Client {artist}' where id=${f.booking}`;
    await asUser(tx,f.owner); await tx`select public.use_contract_template(${f.booking},${f.own})`;
    const [row] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    expect(row?.['terms']).toEqual({clauses:[{title:'Contract Test Artist / Client {artist}',body:'Live vocals|2026-12-09|||AED 1050.00|AED 50.00'}],rider:'Water for Contract Test Artist'});
  }));

  it('freezes terms on acceptance and ignores later template and booking value edits', () => fixture(async (tx,f) => {
    await asUser(tx,f.owner); await tx`select public.use_contract_template(${f.booking},${f.own})`;
    await tx`update public.bookings set contract_accepted_at=now() where id=${f.booking}`;
    const [before] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    await tx`update public.contract_templates set clauses='[]'::jsonb,rider='Changed' where id=${f.own}`;
    await tx`update public.bookings set client_name='Changed',notes='Changed',total=2100 where id=${f.booking}`;
    const [after] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    expect(after?.['terms']).toEqual(before?.['terms']);
    expect(after?.['terms']).not.toBeNull();
  }));

  it('locks accepted template selection, snapshot writes and acceptance reset', () => fixture(async (tx,f) => {
    await asUser(tx,f.owner); await tx`select public.use_contract_template(${f.booking},${f.own})`;
    await tx`update public.bookings set contract_accepted_at=now() where id=${f.booking}`;
    await rejects(tx,s => s`select public.use_contract_template(${f.booking},null)`,'Accepted contracts are locked');
    await rejects(tx,s => s`update public.bookings set contract_template_id=null where id=${f.booking}`,'Accepted contracts are locked');
    await rejects(tx,s => s`update public.bookings set contract_terms='{}'::jsonb where id=${f.booking}`,'Accepted contracts are locked');
    await rejects(tx,s => s`update public.bookings set contract_accepted_at=null where id=${f.booking}`,'Accepted contracts are locked');
  }));

  it('deleting an accepted template clears its foreign key but preserves frozen terms', () => fixture(async (tx,f) => {
    await asUser(tx,f.owner); await tx`select public.use_contract_template(${f.booking},${f.own})`;
    await tx`update public.bookings set contract_accepted_at=now() where id=${f.booking}`;
    const [before] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    await tx`delete from public.contract_templates where id=${f.own}`;
    const [after] = await tx`select contract_template_id,contract_terms from public.bookings where id=${f.booking}`;
    expect(after?.['contract_template_id']).toBeNull();
    expect(after?.['contract_terms']).toEqual(before?.['terms']);
  }));

  it('accepted bookings without templates retain null terms on subsequent writes', () => fixture(async (tx,f) => {
    await tx`update public.bookings set contract_accepted_at=now() where id=${f.booking}`;
    await tx`update public.bookings set notes='Updated old booking' where id=${f.booking}`;
    await asUser(tx,f.owner);
    const [row] = await tx`select public.booking_contract_terms(${f.booking}) as terms`;
    expect(row?.['terms']).toBeNull();
  }));

  it('rejects manual snapshots before acceptance', () => fixture(async (tx,f) => {
    await rejects(tx,s => s`update public.bookings set contract_terms='{}'::jsonb where id=${f.booking}`,'generated only on acceptance');
  }));

  it('rejects contract preview from another artist team', () => fixture(async (tx,f) => {
    await asUser(tx,f.outsider);
    await rejects(tx,s => s`select public.booking_contract_terms(${f.booking})`,'Only the artist team');
  }));

  it('clients cannot read library rows, anon cannot read templates or execute RPCs', () => fixture(async (tx,f) => {
    await asUser(tx,randomUUID());
    expect(await tx`select id from public.contract_templates`).toHaveLength(0);
    await tx.unsafe('RESET ROLE'); await tx.unsafe('SET LOCAL ROLE anon');
    await rejects(tx,s => s`select id from public.contract_templates`,'permission denied');
    await rejects(tx,s => s`select public.use_contract_template(${f.booking},null)`,'permission denied');
    await rejects(tx,s => s`select public.booking_contract_terms(${f.booking})`,'permission denied');
  }));

  it('admins can manage inactive library templates', () => fixture(async (tx,f) => {
    const [admin] = await tx`select user_id from public.user_roles where role='admin' limit 1`;
    if (!admin) throw new Error('An existing admin is required for the admin-access regression');
    await asUser(tx,String(admin['user_id']));
    expect(await tx`update public.contract_templates set description='Admin edit' where id=${f.inactive} returning id`).toHaveLength(1);
    const [created] = await tx`insert into public.contract_templates (name,is_active) values ('Admin draft',false) returning id`;
    expect(await tx`delete from public.contract_templates where id=${String(created?.['id'])} returning id`).toHaveLength(1);
  }));
});