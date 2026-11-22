import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['EXPIRY_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !target.pathname.startsWith('/contract_expiry_')) {
    throw new Error('Expiry tests require a fresh local contract_expiry_* database');
  }
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;
const owner = randomUUID(), admin = randomUUID(), artist = randomUUID();
const rollback = new Error('rollback expiry fixtures');
async function fixture(run: (tx: TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Missing isolated database');
  try { await db.begin(async tx => { await run(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
async function asUser(tx: TransactionSql, user = owner) {
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  await tx.unsafe('SET LOCAL ROLE authenticated');
}
async function booking(tx: TransactionSql, status = 'quoted', paid = 0, escrow = 'none', offset = -1) {
  const id = randomUUID();
  await tx`insert into bookings(id,artist_id,status,paid_amount,escrow_status,event_date)
    values(${id},${artist},${status},${paid},${escrow},(now() at time zone 'Asia/Dubai')::date + ${offset}::int)`;
  return id;
}
async function invoice(tx: TransactionSql, due: string | null = null, linked: string | null = null, status = 'issued') {
  const id = randomUUID();
  await tx`insert into service_invoices(id,artist_id,booking_id,status,document)
    values(${id},${artist},${linked},${status},${tx.json(due === null ? {} : { due })})`;
  return id;
}
async function due(tx: TransactionSql, offset: number) {
  const [row] = await tx`select to_char((now() at time zone 'Asia/Dubai')::date + ${offset}::int,'YYYY-MM-DD') as day`;
  if (typeof row?.['day'] !== 'string') throw new Error('Missing date');
  return row['day'];
}
async function expire(tx: TransactionSql) {
  return (await tx`select expire_unpaid_records() as result`)[0]?.['result'] as Record<string, number>;
}
afterAll(async () => { await db?.end(); });
describe.skipIf(!connection)('unpaid record expiry database rules', () => {
  beforeAll(async () => {
    if (!db) throw new Error('Missing isolated database');
    await db.unsafe(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE artists(id uuid PRIMARY KEY,user_id uuid);
      CREATE TABLE user_roles(user_id uuid,role text);
      CREATE FUNCTION has_role(_user uuid,_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user AND role=_role) $$;
      CREATE FUNCTION is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM artists WHERE id=_artist AND user_id=auth.uid()) $$;
      CREATE TABLE quote_requests(id uuid PRIMARY KEY,artist_id uuid,deleted_at timestamptz);
      CREATE TABLE bookings(id uuid PRIMARY KEY,artist_id uuid,status text,paid_amount numeric,escrow_status text,event_date date,deleted_at timestamptz);
      CREATE TABLE service_invoices(id uuid PRIMARY KEY,artist_id uuid,status text,booking_id uuid REFERENCES bookings(id),document jsonb DEFAULT '{}',deleted_at timestamptz);
      CREATE TABLE payment_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_id uuid,status text);
      CREATE TABLE disputes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE);
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE);
      CREATE TABLE reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL);
      CREATE TABLE invoice_dependents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid REFERENCES service_invoices(id) ON DELETE CASCADE);
      GRANT SELECT ON quote_requests,bookings,service_invoices TO authenticated;
      ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
      ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE service_invoices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY team_read ON quote_requests FOR SELECT TO authenticated USING (is_artist_team(artist_id));
      CREATE POLICY team_read ON bookings FOR SELECT TO authenticated USING (is_artist_team(artist_id));
      CREATE POLICY team_read ON service_invoices FOR SELECT TO authenticated USING (is_artist_team(artist_id));
    `);
    await db.unsafe(readFileSync('drizzle/migrations/0050_unpaid_record_expiry.sql', 'utf8'));
    await db`insert into artists values(${artist},${owner})`;
    await db`insert into user_roles values(${admin},'admin')`;
  });

  it.each(['bookings','service_invoices'] as const)('manual hiding tags %s as manual', table => fixture(async tx => {
    const id = table === 'bookings' ? await booking(tx) : await invoice(tx);
    await asUser(tx);
    const rpc = table === 'bookings' ? 'soft_delete_bookings' : 'soft_delete_invoices';
    expect((await tx.unsafe(`select ${rpc}($1::uuid[]) as hidden`, [[id]]))[0]?.['hidden']).toBe(1);
    await tx.unsafe('RESET ROLE');
    expect((await tx.unsafe(`select deleted_reason from ${table} where id=$1`, [id]))[0]?.['deleted_reason']).toBe('manual');
  }));
  it.each([-1,0,1])('invoice due-date boundary %s is strictly before Dubai today', offset => fixture(async tx => {
    const id = await invoice(tx, await due(tx, offset));
    const result = await expire(tx);
    expect(result['invoices_hidden']).toBe(offset < 0 ? 1 : 0);
    expect((await tx`select deleted_reason from service_invoices where id=${id}`)[0]?.['deleted_reason']).toBe(offset < 0 ? 'expired' : null);
  }));
  it.each([null,'','bad-date','2026-02-30','2026-2-01'])('missing/malformed due date %s never expires', date => fixture(async tx => {
    await invoice(tx,date);
    expect((await expire(tx))['invoices_hidden']).toBe(0);
  }));
  it('uses Dubai rather than the session calendar date', () => fixture(async tx => {
    await tx.unsafe("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
    const yesterday = await due(tx,-1);
    await invoice(tx,yesterday);
    expect((await expire(tx))['invoices_hidden']).toBe(1);
  }));
  it.each(['inquiry','quoted','cancelled'])('expires unpaid %s and its undated unpaid invoice', status => fixture(async tx => {
    const id = await booking(tx,status);
    const inv = await invoice(tx,null,id);
    expect(await expire(tx)).toMatchObject({bookings_hidden:1,invoices_hidden:1,purged:0});
    expect((await tx`select deleted_reason from service_invoices where id=${inv}`)[0]?.['deleted_reason']).toBe('expired');
  }));
  it.each([
    {status:'confirmed',paid:0,escrow:'none',offset:-1},
    {status:'completed',paid:0,escrow:'none',offset:-1},
    {status:'disputed',paid:0,escrow:'none',offset:-1},
    {status:'quoted',paid:1,escrow:'none',offset:-1},
    {status:'quoted',paid:0,escrow:'held',offset:-1},
    {status:'quoted',paid:0,escrow:'released',offset:-1},
    {status:'quoted',paid:0,escrow:'none',offset:0},
    {status:'quoted',paid:0,escrow:'none',offset:1},
  ])('protects ineligible booking $status/$paid/$escrow/$offset', rule => fixture(async tx => {
    const id = await booking(tx,rule.status,rule.paid,rule.escrow,rule.offset);
    expect((await expire(tx))['bookings_hidden']).toBe(0);
    expect((await tx`select deleted_at from bookings where id=${id}`)[0]?.['deleted_at']).toBeNull();
  }));
  it('protects paid invoices and invoices linked to partly paid bookings', () => fixture(async tx => {
    const linked = await booking(tx,'quoted',1);
    await invoice(tx,await due(tx,-1),null,'paid');
    await invoice(tx,await due(tx,-1),linked);
    expect((await expire(tx))['invoices_hidden']).toBe(0);
  }));
  it('is idempotent and logs every run with accurate counts', () => fixture(async tx => {
    await booking(tx);
    await invoice(tx,await due(tx,-1));
    const first = await expire(tx), second = await expire(tx);
    expect(first).toMatchObject({invoices_hidden:1,bookings_hidden:1,purged:0});
    expect(second).toMatchObject({invoices_hidden:0,bookings_hidden:0,purged:0});
    expect((await tx`select count(*)::int as n,sum(invoices_hidden)::int as invoices,sum(bookings_hidden)::int as bookings from expiry_runs`)[0]).toMatchObject({n:2,invoices:1,bookings:1});
  }));
  it.each([89,90,91])('purges expired records strictly older than 90 days: %s', age => fixture(async tx => {
    const b = await booking(tx), i = await invoice(tx,null,b);
    await tx`update bookings set deleted_at=now()-${age}::int*interval '1 day',deleted_reason='expired' where id=${b}`;
    await tx`update service_invoices set deleted_at=now()-${age}::int*interval '1 day',deleted_reason='expired' where id=${i}`;
    expect((await expire(tx))['purged']).toBe(age > 90 ? 2 : 0);
  }));
  it.each(['manual',null])('never purges manual or legacy reason %s', reason => fixture(async tx => {
    const b=await booking(tx), i=await invoice(tx);
    await tx`update bookings set deleted_at=now()-interval '100 days',deleted_reason=${reason} where id=${b}`;
    await tx`update service_invoices set deleted_at=now()-interval '100 days',deleted_reason=${reason} where id=${i}`;
    expect((await expire(tx))['purged']).toBe(0);
  }));
  it.each(['paid','pending'])('preserves booking and invoice with %s payment orders', status => fixture(async tx => {
    const b=await booking(tx), i=await invoice(tx,null,b);
    await tx`update bookings set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${b}`;
    await tx`update service_invoices set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${i}`;
    await tx`insert into payment_orders(target_id,status) values(${b},${status}),(${i},${status})`;
    expect((await expire(tx))['purged']).toBe(0);
  }));
  it('never purges records that later received payment', () => fixture(async tx => {
    const b=await booking(tx,'quoted',1), i=await invoice(tx,null,b,'paid');
    await tx`update bookings set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${b}`;
    await tx`update service_invoices set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${i}`;
    expect((await expire(tx))['purged']).toBe(0);
  }));
  it.each(['disputes','notifications','reviews'])('preserves booking and dependent %s without cascade or detachment', table => fixture(async tx => {
    const b=await booking(tx);
    await tx`update bookings set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${b}`;
    await tx.unsafe(`insert into ${table}(booking_id) values($1)`,[b]);
    expect((await expire(tx))['purged']).toBe(0);
    expect((await tx.unsafe(`select booking_id from ${table}`))[0]?.['booking_id']).toBe(b);
  }));
  it('preserves invoices with dependent records and their booking', () => fixture(async tx => {
    const b=await booking(tx), i=await invoice(tx,null,b);
    await tx`update bookings set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${b}`;
    await tx`update service_invoices set deleted_at=now()-interval '100 days',deleted_reason='expired' where id=${i}`;
    await tx`insert into invoice_dependents(invoice_id) values(${i})`;
    expect((await expire(tx))['purged']).toBe(0);
    expect((await tx`select invoice_id from invoice_dependents`)[0]?.['invoice_id']).toBe(i);
  }));
  it.each(['anon','authenticated'])('denies expiry execution to %s', role => fixture(async tx => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    await expect(tx.savepoint(s=>s`select expire_unpaid_records()`)).rejects.toThrow('permission denied');
  }));
  it('allows service role execution and admin-only run-log reading', () => fixture(async tx => {
    await tx.unsafe('SET LOCAL ROLE service_role');
    expect((await expire(tx))['purged']).toBe(0);
    await asUser(tx);
    expect(await tx`select * from expiry_runs`).toHaveLength(0);
    await asUser(tx,admin);
    expect(await tx`select * from expiry_runs`).toHaveLength(1);
  }));
  it.each(['quote_requests','bookings','service_invoices'] as const)('dashboard RLS excludes hidden %s', table => fixture(async tx => {
    const id = table==='bookings' ? await booking(tx) : table==='service_invoices' ? await invoice(tx) : randomUUID();
    if (table==='quote_requests') await tx`insert into quote_requests(id,artist_id) values(${id},${artist})`;
    await asUser(tx);
    expect(await tx.unsafe(`select id from ${table} where id=$1`,[id])).toHaveLength(1);
    await tx.unsafe('RESET ROLE');
    await tx.unsafe(`update ${table} set deleted_at=now() where id=$1`,[id]);
    await asUser(tx);
    expect(await tx.unsafe(`select id from ${table} where id=$1`,[id])).toHaveLength(0);
  }));
});