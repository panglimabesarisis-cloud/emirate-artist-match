// The attacks from the bug bounty report, run as ordinary visitors and artists against every migration on a fresh
// LOCAL database. Run with TEAM_ACCESS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/team_access_<name>.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['TEAM_ACCESS_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/team_access_')) throw new Error('Attack fixtures require a fresh local team_access_* database');
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;

const owner = randomUUID(), attacker = randomUUID(), victim = randomUUID(), client = randomUUID();
const artist = randomUUID(), review = randomUUID(), quote = randomUUID();
const EMAIL = 'client@example.test';
const rollback = new Error('rollback');
async function as(user: string | null, run: (tx: TransactionSql) => Promise<void>, role = 'authenticated') {
  try {
    await db!.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${user ?? ''},true), set_config('request.jwt.claim.role',${role},true)`;
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      await run(tx);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const refused = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return false; } catch { return true; }
};
/** Reads as the database owner, then returns to the signed-in role. */
async function truth<T>(tx: TransactionSql, query: string): Promise<T> {
  await tx.unsafe('RESET ROLE');
  const rows = await tx.unsafe(query);
  await tx.unsafe('SET LOCAL ROLE authenticated');
  return rows[0] as T;
}
const booking = (values: { amount: number; paid: number; refund?: number; status: string; escrow: string; email?: string; id?: string }) =>
  db!`insert into bookings(id,artist_id,client_name,client_email,event_date,amount,vat_amount,total,paid_amount,refund_amount,status,escrow_status,commission_rate,completed_at)
    values(${values.id ?? randomUUID()},${artist},'Client',${values.email ?? EMAIL},'2026-01-10',${values.amount},${values.amount * 0.05},${values.amount * 1.05},${values.paid},${values.refund ?? 0},${values.status},${values.escrow},20,now() - interval '3 days')`;
const released = randomUUID();

describe.skipIf(!db)('0099 bug bounty fixes', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      if (file.startsWith('0098_')) {
        for (const [i, id] of [owner, attacker, victim, client].entries()) await db!`insert into auth.users(id,email) values(${id},${`bounty${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    await db!`insert into user_roles(user_id,role) values(${attacker},'artist'),(${victim},'artist'),(${client},'client') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${victim},'victim-artist','Victim','approved')`;
    // 1000 released in full; 1000 half refunded after a dispute; a 200 deposit released by a dispute.
    await booking({ id: released, amount: 1000, paid: 1050, status: 'completed', escrow: 'released' });
    await booking({ amount: 1000, paid: 1050, refund: 525, status: 'completed', escrow: 'partially_refunded' });
    await booking({ amount: 1000, paid: 210, status: 'completed', escrow: 'released' });
    // Money that is not the artist's to withdraw.
    await booking({ amount: 1000, paid: 0, status: 'completed', escrow: 'none' });
    await booking({ amount: 1000, paid: 1050, status: 'completed', escrow: 'release_pending' });
    await booking({ amount: 1000, paid: 1050, refund: 525, status: 'cancelled', escrow: 'partially_refunded' });
    await db!`insert into client_ratings(booking_id,artist_id,client_email,rating,note,created_by) values(${released},${artist},${EMAIL},2,'private note',${victim})`;
    await db!`insert into reviews(id,artist_id,client_name,rating,body,status,rating_performance,rating_punctuality,rating_communication) values(${review},${artist},'Client',2,'Late','published',1,1,1)`;
    await db!`insert into quote_requests(id,artist_id,name,email,budget) values(${quote},${artist},'Client',${EMAIL},100)`;
    await db!.begin(async tx => {
      await tx.unsafe('SET LOCAL session_replication_role = replica');
      await tx`insert into artist_bank_details(artist_id,holder_name,bank_name,iban,updated_at) values(${artist},'Victim','Bank','AE000000000000000000000',now() - interval '3 days')`;
    });
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('BUG-01: an artist cannot choose or change the registration date and other server fields', async () => {
    await as(attacker, async tx => {
      await tx.unsafe(`insert into artists(user_id,slug,stage_name,status,featured,plan,onboarding_complete,created_at,response_rate,is_seed) values('${attacker}','attack-artist','X','pending',false,'free',false,'2016-12-01',100,true)`);
      const check = `select created_at > now() - interval '1 hour' as fresh, response_rate, is_seed, calendar_token from artists where user_id='${attacker}'`;
      const { id } = await truth<{ id: string }>(tx, `select id from artists where user_id='${attacker}'`);
      const first = await truth<{ fresh: boolean; response_rate: number | null; is_seed: boolean; calendar_token: string }>(tx, check);
      expect(first).toMatchObject({ fresh: true, is_seed: false, response_rate: 90 });
      await tx.unsafe(`update artists set created_at='2016-12-01', response_rate=100, is_seed=true, calendar_token=gen_random_uuid(), stage_name='Renamed' where id='${id}'`);
      const after = await truth<typeof first & { stage_name: string }>(tx, check.replace('calendar_token', 'calendar_token, stage_name'));
      expect(after).toMatchObject({ fresh: true, is_seed: false, calendar_token: first.calendar_token, stage_name: 'Renamed' });
      const months = await truth<{ n: number }>(tx, `select count(*)::int n from plan_credit_periods p join artists a on a.id=p.artist_id where a.user_id='${attacker}'`);
      expect(months.n).toBe(1);
    });
  });

  it('BUG-03: only released money, net of refunds, can be withdrawn', async () => {
    await as(victim, async tx => {
      const [wallet] = await tx`select jobs, gross::float, fee::float, available::float from artist_wallet(${artist})`;
      // 1000 + 500 + 200 of service value, less 20% commission.
      expect(wallet).toMatchObject({ jobs: 3, gross: 1700, fee: 340, available: 1360 });
    });
  });

  it('BUG-02: a payout takes a lock on the artist and cannot exceed the balance', async () => {
    await as(victim, async tx => {
      await tx`insert into payout_requests(artist_id,amount) values(${artist},1000)`;
      const locks = await truth<{ n: number }>(tx, `select count(*)::int n from pg_locks where locktype='advisory' and granted`);
      expect(locks.n).toBeGreaterThan(0);
      expect(await refused(tx, `insert into payout_requests(artist_id,amount) values('${artist}',1000)`)).toBe(true);
    });
  });

  it('BUG-02: an admin cannot mark money paid that is no longer covered', async () => {
    await db!.begin(async tx => {
      await tx.unsafe('SET LOCAL session_replication_role = replica');
      for (const amount of [1000, 900]) await tx`insert into payout_requests(artist_id,amount,status) values(${artist},${amount},'pending')`;
    });
    try {
      await as(owner, async tx => {
        expect(await refused(tx, `update payout_requests set status='paid' where artist_id='${artist}' and amount=1000`)).toBe(true);
        expect(await refused(tx, `update payout_requests set status='rejected', admin_note='duplicate' where artist_id='${artist}' and amount=900`)).toBe(false);
        expect(await refused(tx, `update payout_requests set status='paid' where artist_id='${artist}' and amount=1000`)).toBe(false);
        expect(await refused(tx, `update payout_requests set status='paid' where artist_id='${artist}' and amount=900`)).toBe(true);
      });
    } finally { await db!`delete from payout_requests where artist_id=${artist}`; }
  });

  it('BUG-04: ratings of other artists show only as an average for the artist’s own clients', async () => {
    await as(attacker, async tx => {
      await tx.unsafe(`insert into artists(user_id,slug,stage_name,status,featured,plan,onboarding_complete) values('${attacker}','attack-artist','X','pending',false,'free',false)`);
      expect((await tx.unsafe('select * from client_ratings')).length).toBe(0);
      const mine = await truth<{ id: string }>(tx, `select id from artists where user_id='${attacker}'`);
      expect((await tx`select * from client_rating_summary(${mine.id})`).length).toBe(0);
      expect(await refused(tx, `select * from client_rating_summary('${artist}')`)).toBe(true);
    });
    await as(victim, async tx => {
      expect((await tx.unsafe('select note from client_ratings')).length).toBe(1);
      const rows = await tx`select * from client_rating_summary(${artist})`;
      expect(rows.map(r => ({ ...r }))).toEqual([{ client_email: EMAIL, average: '2.0', ratings: 1 }]);
    });
  });

  it('BUG-04: visitors cannot write quote requests and artists change only their status', async () => {
    const insert = `insert into quote_requests(artist_id,name,email,budget,status) values('${artist}','x','${EMAIL}',1,'new')`;
    await as(null, async tx => { expect(await refused(tx, insert)).toBe(true); }, 'anon');
    await as(attacker, async tx => { expect(await refused(tx, insert)).toBe(true); });
    await as(victim, async tx => {
      expect(await refused(tx, `update quote_requests set email='other@example.test' where id='${quote}'`)).toBe(true);
      expect((await tx.unsafe(`update quote_requests set status='closed' where id='${quote}' returning id`)).length).toBe(1);
    });
  });

  it('BUG-07: an artist replies to or reports a review and changes nothing else', async () => {
    await as(victim, async tx => {
      await tx.unsafe(`update reviews set rating=5, rating_performance=5, rating_punctuality=5, rating_communication=5, body='Great', event_label='x', reply='Thanks', status='reported' where id='${review}'`);
      const row = await truth<Record<string, unknown>>(tx, `select rating, rating_performance, rating_punctuality, rating_communication, body, event_label, reply, status from reviews where id='${review}'`);
      expect(row).toMatchObject({ rating: 2, rating_performance: 1, rating_punctuality: 1, rating_communication: 1, body: 'Late', event_label: null, reply: 'Thanks', status: 'reported' });
    });
    await as(owner, async tx => { expect((await tx.unsafe(`update reviews set status='hidden' where id='${review}' returning status`))[0]).toMatchObject({ status: 'hidden' }); });
  });

  it('BUG-06/08: the limiter counts per bucket and only the server may call it', async () => {
    await as(attacker, async tx => { expect(await refused(tx, `select hit_rate_limit('x',1,interval '1 hour')`)).toBe(true); });
    await as(null, async tx => { expect(await refused(tx, `select hit_rate_limit('x',1,interval '1 hour')`)).toBe(true); }, 'anon');
    await as(null, async tx => {
      const hit = async (bucket: string) => (await tx`select hit_rate_limit(${bucket},2,interval '1 hour') ok`)[0]!['ok'] as boolean;
      expect([await hit('a'), await hit('a'), await hit('a'), await hit('b')]).toEqual([true, true, false, true]);
    }, 'service_role');
  });

  it('keeps money retained from a cancellation in escrow in the ledger, matching the wallet', async () => {
    await as(owner, async tx => {
      const lines = await tx`select account, sum(debit)::float d, sum(credit)::float c from admin_ledger('2020-01-01','2028-01-01') group by account`;
      const of = (name: string) => lines.find(l => l['account'] === name);
      expect(of('Artist payable')?.['c']).toBe(1360);
      expect(of('Platform commission revenue')?.['c']).toBe(340);
    });
  });

  it('releases due escrow on a schedule, never a disputed or recent booking', async () => {
    await as(null, async tx => {
      const [row] = await tx`select release_due_escrow() n`;
      expect(row!['n']).toBe(1);
    }, 'service_role');
  });
});
