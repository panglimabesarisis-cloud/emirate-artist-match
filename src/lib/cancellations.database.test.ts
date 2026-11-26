// Cancellation requests, manual ledger adjustments and security status (0102) against every migration on a
// fresh LOCAL database. Run with TEAM_ACCESS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/team_access_<name>.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['TEAM_ACCESS_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/team_access_')) throw new Error('Fixtures require a fresh local team_access_* database');
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;

const owner = randomUUID(), staff = randomUUID(), performer = randomUUID(), client = randomUUID(), stranger = randomUUID();
const artist = randomUUID(), far = randomUUID(), soon = randomUUID(), mid = randomUUID();
const rollback = new Error('rollback');
async function transaction(run: (tx: TransactionSql, as: (user: string | null, role?: string) => Promise<void>) => Promise<void>) {
  try {
    await db!.begin(async tx => {
      await run(tx, async (user, role = 'authenticated') => {
        await tx.unsafe('RESET ROLE');
        await tx`select set_config('request.jwt.claim.sub',${user ?? ''},true), set_config('request.jwt.claim.role',${role},true)`;
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
      });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const refused = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return false; } catch { return true; }
};
const REASON = 'The event was moved to another country by the host.';
const NOTE = 'Reviewed with the client and the artist today.';

describe.skipIf(!db)('0102 cancellations, adjustments and security status', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      if (file.startsWith('0098_')) {
        for (const [i, id] of [owner, staff, performer, client, stranger].entries()) await db!`insert into auth.users(id,email) values(${id},${`cancel${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    await db!`insert into user_roles(user_id,role) values(${staff},'admin'),(${performer},'artist'),(${client},'client'),(${stranger},'client') on conflict do nothing`;
    await db!`insert into admin_permissions(user_id,module,can_read,can_edit,can_delete) values(${staff},'finance',true,false,false)`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${performer},'cancel-artist','Cancel Artist','approved')`;
    for (const [id, days] of [[far, 30], [mid, 10], [soon, 7]] as const) {
      await db!`insert into bookings(id,artist_id,client_user_id,client_name,event_date,amount,vat_amount,total,paid_amount,status,escrow_status,commission_rate,paid_at)
        values(${id},${artist},${client},'Client',(now() at time zone 'Asia/Dubai')::date + ${days}::int,1000,50,1050,1050,'confirmed','held',20,now())`;
    }
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('lets only the client ask, with a clear reason, and never within 7 days of the event', () => transaction(async (tx, as) => {
    await as(stranger);
    expect(await refused(tx, `select request_cancellation('${far}','${REASON}')`)).toBe(true);
    await as(client);
    expect(await refused(tx, `select request_cancellation('${soon}','${REASON}')`)).toBe(true);
    expect(await refused(tx, `select request_cancellation('${far}','too short')`)).toBe(true);
    await tx`select request_cancellation(${far},${REASON})`;
    await tx`select request_cancellation(${mid},${REASON})`;
    expect(await refused(tx, `select request_cancellation('${far}','${REASON}')`)).toBe(true);
    const rows = await tx`select booking_id, suggested_refund::float s, status from cancellation_requests order by suggested_refund desc`;
    expect(rows.map(r => [r['booking_id'], r['s'], r['status']])).toEqual([[far, 1050, 'pending'], [mid, 525, 'pending']]);
    expect((await tx`select count(*)::int n from support_ticket_messages`)[0]!['n']).toBe(2);
    // The booking is untouched until an administrator decides.
    expect((await tx`select status from bookings where id=${far}`)[0]).toMatchObject({ status: 'confirmed' });
    expect(await refused(tx, `insert into cancellation_requests(booking_id,client_user_id,reason) values('${soon}','${client}','${REASON}')`)).toBe(true);
    expect(await refused(tx, `update bookings set status='cancelled' where id='${far}' returning id`) || (await tx`select status from bookings where id=${far}`)[0]!['status'] === 'confirmed').toBe(true);
    await as(stranger);
    expect((await tx`select * from cancellation_requests`).length).toBe(0);
  }));

  it('approves with the money split recorded, matching the wallet and the ledger', () => transaction(async (tx, as) => {
    await as(client);
    const [a] = await tx`select request_cancellation(${far},${REASON}) id`;
    const [b] = await tx`select request_cancellation(${mid},${REASON}) id`;
    await as(staff);
    expect(await refused(tx, `select claim_cancellation('${a!['id']}')`)).toBe(true);
    await as(owner);
    await tx`select claim_cancellation(${a!['id']})`;
    expect(await refused(tx, `select claim_cancellation('${a!['id']}')`)).toBe(true);
    expect(await refused(tx, `select finish_cancellation('${a!['id']}',true,525,null,'${NOTE}')`)).toBe(true);
    expect(await refused(tx, `select finish_cancellation('${a!['id']}',true,2000,'artist','${NOTE}')`)).toBe(true);
    await tx`select finish_cancellation(${a!['id']},true,525,'artist',${NOTE})`;
    await tx`select claim_cancellation(${b!['id']})`;
    await tx`select finish_cancellation(${b!['id']},true,525,'platform',${NOTE})`;
    const bookings = await tx`select id, status, escrow_status, refund_amount::float r, retained_to from bookings where id in (${far},${mid}) order by retained_to`;
    expect(bookings.map(r => ({ ...r }))).toEqual([
      { id: far, status: 'cancelled', escrow_status: 'partially_refunded', r: 525, retained_to: 'artist' },
      { id: mid, status: 'cancelled', escrow_status: 'partially_refunded', r: 525, retained_to: 'platform' }]);
    const lines = await tx`select account, sum(debit)::float d, sum(credit)::float c from admin_ledger('2020-01-01','2030-01-01') group by account`;
    const credit = (name: string) => lines.find(l => l['account'] === name)?.['c'];
    expect([credit('Artist payable'), credit('Platform commission revenue'), credit('Cancellation fee revenue')]).toEqual([400, 100, 500]);
    expect(Math.round(lines.reduce((n, l) => n + Number(l['d']) - Number(l['c']), 0) * 100)).toBe(0);
    await as(performer);
    expect((await tx`select jobs, available::float from artist_wallet(${artist})`)[0]).toMatchObject({ jobs: 0, available: 400 });
    await as(client);
    expect((await tx`select count(*)::int n from support_ticket_messages where sender_role='admin'`)[0]!['n']).toBe(2);
  }));

  it('rejects with a reason and leaves the booking as it was', () => transaction(async (tx, as) => {
    await as(client);
    const [a] = await tx`select request_cancellation(${far},${REASON}) id`;
    await as(owner);
    expect(await refused(tx, `select finish_cancellation('${a!['id']}',false,0,null,'no')`)).toBe(true);
    await tx`select finish_cancellation(${a!['id']},false,0,null,${NOTE})`;
    expect((await tx`select status from bookings where id=${far}`)[0]).toMatchObject({ status: 'confirmed' });
    expect((await tx`select status, decision_note from cancellation_requests`)[0]).toMatchObject({ status: 'rejected', decision_note: NOTE });
  }));

  it('posts balanced adjustments that can only be reversed, once', () => transaction(async (tx, as) => {
    const post = `select post_ledger_adjustment(current_date - 1,'Payment processor fees','Cash at payment processor',12.5,'Processor fee for November')`;
    await as(staff); expect(await refused(tx, post)).toBe(true);
    await as(client); expect(await refused(tx, post)).toBe(true);
    await as(owner);
    expect(await refused(tx, `select post_ledger_adjustment(current_date + 5,'Adjustments','Cash at payment processor',1,'A date in the future')`)).toBe(true);
    expect(await refused(tx, `select post_ledger_adjustment(current_date,'Adjustments','Adjustments',1,'Same account on both sides')`)).toBe(true);
    const [made] = await tx.unsafe(post);
    const id = made!['post_ledger_adjustment'] as string;
    expect(await refused(tx, `update ledger_adjustments set amount=1`)).toBe(true);
    expect(await refused(tx, `delete from ledger_adjustments`)).toBe(true);
    const [back] = await tx`select reverse_ledger_adjustment(${id},'Entered against the wrong month') r`;
    expect(await refused(tx, `select reverse_ledger_adjustment('${id}','Entered against the wrong month')`)).toBe(true);
    expect(await refused(tx, `select reverse_ledger_adjustment('${back!['r']}','Undoing the reversal again')`)).toBe(true);
    const lines = await tx`select sum(debit)::float d, sum(credit)::float c from admin_ledger('2020-01-01','2030-01-01') where journal like 'adjustment:%'`;
    expect(lines[0]).toMatchObject({ d: 25, c: 25 });
  }));

  it('reports scheduled jobs and security status to entitled admins only', () => transaction(async (tx, as) => {
    await as(owner);
    expect((await tx`select admin_scheduled_jobs() j`)[0]!['j']).toEqual([]);
    const status = (await tx`select admin_security_overview() s`)[0]!['s'] as Record<string, unknown>;
    expect(status).toMatchObject({ owners: 1, admins: 2, tables_without_row_security: [] });
    await as(client);
    expect(await refused(tx, 'select admin_security_overview()')).toBe(true);
    expect(await refused(tx, 'select admin_scheduled_jobs()')).toBe(true);
  }));
});
