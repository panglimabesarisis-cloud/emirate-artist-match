import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['SOFT_DELETE_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/contract_soft_delete_')) {
    throw new Error('Soft-delete fixtures require a fresh local contract_soft_delete_* database');
  }
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;
const owner = randomUUID(), member = randomUUID(), outsider = randomUUID();
const artist = randomUUID(), other = randomUUID();
const rollback = new Error('rollback soft-delete fixtures');
async function fixture(run: (tx: TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Missing isolated database');
  try {
    await db.begin(async tx => { await run(tx); throw rollback; });
  } catch (error) { if (error !== rollback) throw error; }
}
async function asUser(tx: TransactionSql, user = member) {
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  await tx.unsafe('SET LOCAL ROLE authenticated');
}
async function booking(tx: TransactionSql, status = 'quoted', paid = 0, escrow = 'none', artistId = artist) {
  const id = randomUUID();
  await tx`insert into public.bookings(id,artist_id,status,paid_amount,escrow_status,amount) values(${id},${artistId},${status},${paid},${escrow},1000)`;
  return id;
}
afterAll(async () => { await db?.end(); });
describe.skipIf(!connection)('dashboard soft-delete database rules', () => {
  beforeAll(async () => {
    if (!db) throw new Error('Missing isolated database');
    await db.unsafe(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE public.artists(id uuid PRIMARY KEY,user_id uuid,status text DEFAULT 'approved',response_rate int,created_at timestamptz DEFAULT now());
      CREATE TABLE public.artist_members(artist_id uuid,user_id uuid,status text);
      CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
        SELECT EXISTS(SELECT 1 FROM artists WHERE id=_artist AND user_id=auth.uid()) OR EXISTS(SELECT 1 FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active') $$;
      CREATE TABLE public.quote_requests(id uuid PRIMARY KEY,artist_id uuid,status text);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY,artist_id uuid,status text,paid_amount numeric,escrow_status text,amount numeric,client_name text DEFAULT 'Client');
      CREATE TABLE public.service_invoices(id uuid PRIMARY KEY,artist_id uuid,status text,booking_id uuid REFERENCES public.bookings(id));
      CREATE TABLE public.reviews(artist_id uuid,booking_id uuid,rating int,status text);
      CREATE TABLE public.stat_visibility(artist_id uuid,show_orders boolean,show_rating boolean,revenue_mode text,show_response boolean,show_repeat boolean,show_member_since boolean);
      GRANT SELECT ON public.quote_requests,public.bookings,public.service_invoices TO authenticated;
    `);
    await db.unsafe(readFileSync('drizzle/migrations/0049_dashboard_soft_delete.sql','utf8'));
    await db`insert into artists(id,user_id) values(${artist},${owner}),(${other},${outsider})`;
    await db`insert into artist_members values(${artist},${member},'active')`;
  });

  it.each(['new','contacted','closed','converted'])('hides quotes of any status: %s', status => fixture(async tx => {
    const id = randomUUID();
    await tx`insert into quote_requests values(${id},${artist},${status},null)`;
    await asUser(tx);
    const [result] = await tx`select soft_delete_quote_requests(array[${id}]::uuid[]) as hidden`;
    expect(result?.['hidden']).toBe(1);
    expect((await tx`select deleted_at from quote_requests where id=${id}`)[0]?.['deleted_at']).not.toBeNull();
  }));

  it.each(['inquiry','quoted','cancelled'])('hides unpaid %s bookings', status => fixture(async tx => {
    const id = await booking(tx,status);
    await asUser(tx,owner);
    expect((await tx`select soft_delete_bookings(array[${id}]::uuid[]) as hidden`)[0]?.['hidden']).toBe(1);
    expect((await tx`select paid_amount,status,escrow_status,amount from bookings where id=${id}`)[0]).toEqual({paid_amount:'0',status,escrow_status:'none',amount:'1000'});
  }));

  it.each(['confirmed','completed','disputed'])('skips bookings with protected status %s', status => fixture(async tx => {
    const id = await booking(tx,status);
    await asUser(tx);
    expect((await tx`select soft_delete_bookings(array[${id}]::uuid[]) as hidden`)[0]?.['hidden']).toBe(0);
    expect((await tx`select deleted_at from bookings where id=${id}`)[0]?.['deleted_at']).toBeNull();
  }));

  it.each(['held','released'])('skips bookings with %s escrow', escrow => fixture(async tx => {
    const id = await booking(tx,'quoted',0,escrow);
    await asUser(tx);
    expect((await tx`select soft_delete_bookings(array[${id}]::uuid[]) as hidden`)[0]?.['hidden']).toBe(0);
  }));
  it('skips bookings with a partial payment', () => fixture(async tx => {
    const id = await booking(tx,'quoted',1);
    await asUser(tx);
    expect((await tx`select soft_delete_bookings(array[${id}]::uuid[]) as hidden`)[0]?.['hidden']).toBe(0);
  }));

  it.each([
    {status:'draft',linked:false,paid:0,hidden:1},
    {status:'issued',linked:true,paid:0,hidden:1},
    {status:'paid',linked:false,paid:0,hidden:0},
    {status:'issued',linked:true,paid:1,hidden:0},
  ])('enforces invoice eligibility: $status / linked=$linked / paid=$paid', rule => fixture(async tx => {
    const id=randomUUID(), linked=rule.linked ? await booking(tx,'quoted',rule.paid) : null;
    await tx`insert into service_invoices values(${id},${artist},${rule.status},${linked},null)`;
    await asUser(tx);
    expect((await tx`select soft_delete_invoices(array[${id}]::uuid[]) as hidden`)[0]?.['hidden']).toBe(rule.hidden);
  }));

  for (const [table, rpc] of [['quote_requests','soft_delete_quote_requests'],['bookings','soft_delete_bookings'],['service_invoices','soft_delete_invoices']] as const) {
    it(`${rpc} skips outsiders and unknown IDs and counts unique newly hidden rows`, () => fixture(async tx => {
      const own=randomUUID(), foreign=randomUUID();
      if (table==='bookings') await tx`insert into bookings(id,artist_id,status,paid_amount,escrow_status) values(${own},${artist},'quoted',0,'none'),(${foreign},${other},'quoted',0,'none')`;
      else await tx.unsafe(`insert into ${table}(id,artist_id,status) values($1,$2,'draft'),($3,$4,'draft')`,[own,artist,foreign,other]);
      await asUser(tx,outsider);
      expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`,[[own]]))[0]?.['hidden']).toBe(0);
      await asUser(tx);
      expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`,[[own,own,foreign,randomUUID()]]))[0]?.['hidden']).toBe(1);
      expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`,[[own]]))[0]?.['hidden']).toBe(0);
      expect((await tx.unsafe(`select deleted_at from ${table} where id=$1`,[foreign]))[0]?.['deleted_at']).toBeNull();
    }));
    it(`${rpc} skips inactive team members`, () => fixture(async tx => {
      const id=randomUUID();
      if (table==='bookings') await tx`insert into bookings(id,artist_id,status,paid_amount,escrow_status) values(${id},${artist},'quoted',0,'none')`;
      else await tx.unsafe(`insert into ${table}(id,artist_id,status) values($1,$2,'draft')`,[id,artist]);
      await tx`update artist_members set status='inactive' where user_id=${member}`;
      await asUser(tx);
      expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`,[[id]]))[0]?.['hidden']).toBe(0);
      expect((await tx.unsafe(`select deleted_at from ${table} where id=$1`,[id]))[0]?.['deleted_at']).toBeNull();
    }));
    it(`${rpc} accepts 200 IDs, rejects 201, and treats null/empty as zero`, () => fixture(async tx => {
      await asUser(tx);
      expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`,[Array.from({length:200},()=>randomUUID())]))[0]?.['hidden']).toBe(0);
      await expect(tx.savepoint(s => s.unsafe(`select ${rpc}($1::uuid[])`,[Array.from({length:201},()=>randomUUID())]))).rejects.toThrow('At most 200');
      expect((await tx.unsafe(`select ${rpc}(null::uuid[]) as hidden`))[0]?.['hidden']).toBe(0);
      expect((await tx.unsafe(`select ${rpc}(array[]::uuid[]) as hidden`))[0]?.['hidden']).toBe(0);
    }));
    it(`${rpc} cannot be executed by anon`, () => fixture(async tx => {
      await tx.unsafe('SET LOCAL ROLE anon');
      await expect(tx.savepoint(s => s.unsafe(`select ${rpc}(array[]::uuid[])`))).rejects.toThrow('permission denied');
    }));
  }

  it('public stats exclude hidden bookings and linked reviews without changing visibility settings', () => fixture(async tx => {
    const visible=await booking(tx,'completed'), hidden=await booking(tx,'completed');
    await tx`update bookings set deleted_at=now() where id=${hidden}`;
    await tx`insert into reviews values(${artist},${visible},5,'published'),(${artist},${hidden},1,'published')`;
    await tx`insert into stat_visibility(artist_id,revenue_mode) values(${artist},'exact')`;
    const [stats]=await tx`select * from artist_public_stats() where artist_id=${artist}`;
    expect(stats?.['completed_orders']).toBe(1);
    expect(stats?.['rating']).toBe('5.0');
    expect(stats?.['review_count']).toBe(1);
    expect(stats?.['repeat_clients']).toBe(0);
    expect(stats?.['revenue_label']).toBe('AED 1,000');
    await tx`update stat_visibility set show_orders=false,show_rating=false,revenue_mode='hidden',show_repeat=false where artist_id=${artist}`;
    const [privateStats]=await tx`select * from artist_public_stats() where artist_id=${artist}`;
    expect(privateStats?.['completed_orders']).toBeNull();
    expect(privateStats?.['rating']).toBeNull();
    expect(privateStats?.['revenue_label']).toBeNull();
    expect(privateStats?.['repeat_clients']).toBeNull();
  }));
});