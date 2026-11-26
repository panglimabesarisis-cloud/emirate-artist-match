// Artist add-ons (0103) against every migration on a fresh LOCAL database.
// Run with TEAM_ACCESS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/team_access_<name>.
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

const owner = randomUUID(), performer = randomUUID(), other = randomUUID();
const artist = randomUUID(), rival = randomUUID(), page = randomUUID(), forever = randomUUID();
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
/** Starts and settles a verified test payment for an add-on, as the server does. */
async function buy(tx: TransactionSql, addon: string, amount = 5250) {
  const order = JSON.stringify({ artist_id: artist, kind: 'addon', target_id: addon, amount_minor: amount, processor_amount_minor: 100000, processor_currency: 'idr', credits: 0 });
  const [o] = await tx`select (begin_test_purchase(${order}::text::jsonb, 'cus', ${`addon:${addon}`})).id`;
  const session = `cs_${randomUUID()}`;
  await tx`update payment_orders set stripe_session_id=${session} where id=${o!['id']}`;
  await tx`select settle_test_purchase(${o!['id']}, ${session}, 100000, 'idr')`;
  return o!['id'] as string;
}

describe.skipIf(!db)('0103 artist add-ons', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      if (file.startsWith('0098_')) {
        for (const [i, id] of [owner, performer, other].entries()) await db!`insert into auth.users(id,email) values(${id},${`addon${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    await db!`insert into user_roles(user_id,role) values(${performer},'artist'),(${other},'artist') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${performer},'addon-artist','Addon Artist','approved'),(${rival},${other},'addon-rival','Rival','approved')`;
    await db!`insert into addons(id,name,kind,description,price_aed,duration_days) values(${page},'AI agent page','ai_page','A private page for your own agent.',50,30)`;
    await db!`insert into addons(id,name,kind,description,price_aed,duration_days,active) values(${forever},'Profile review','service','Our team reviews the profile.',50,null,true)`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('lets only an entitled admin manage add-ons', () => transaction(async (tx, as) => {
    const insert = `insert into addons(name,kind,description,price_aed) values('Hack','ai_page','Free for me please',1)`;
    await as(performer);
    expect(await refused(tx, insert)).toBe(true);
    expect((await tx`update addons set price_aed=1 returning id`).length).toBe(0);
    expect(await refused(tx, `insert into addon_purchases(addon_id,artist_id,order_id,price_aed) values('${page}','${artist}',gen_random_uuid(),0)`)).toBe(true);
    await as(owner);
    expect(await refused(tx, insert)).toBe(false);
  }));

  it('opens the page after a verified payment, extends on renewal and closes after a refund', () => transaction(async (tx, as) => {
    await as(null, 'service_role');
    expect(await refused(tx, `select begin_test_purchase('{"artist_id":"${artist}","kind":"addon","target_id":"${page}","amount_minor":100,"processor_amount_minor":1,"processor_currency":"idr"}'::jsonb,'c','k')`)).toBe(true);
    const first = await buy(tx, page);
    const second = await buy(tx, page);
    await as(performer);
    expect((await tx`select artist_has_addon(${artist},'ai_page') ok`)[0]!['ok']).toBe(true);
    const days = (await tx`select round(extract(epoch from (max(expires_at) - now())) / 86400)::int d, count(*)::int n, sum(price_aed)::float s from addon_purchases`)[0];
    expect(days).toMatchObject({ d: 60, n: 2, s: 100 });
    await as(other);
    expect((await tx`select artist_has_addon(${artist},'ai_page') ok`)[0]!['ok']).toBe(false);
    expect((await tx`select * from addon_purchases`).length).toBe(0);
    await as(null, 'service_role');
    for (const order of [first, second]) await tx`select record_test_refund(${order}, 100000)`;
    await as(performer);
    expect((await tx`select artist_has_addon(${artist},'ai_page') ok`)[0]!['ok']).toBe(false);
  }));

  it('sells a lasting add-on once, records it as revenue and lets an admin mark it delivered', () => transaction(async (tx, as) => {
    await as(null, 'service_role');
    await buy(tx, forever);
    await expect(tx.savepoint(s => buy(s as unknown as TransactionSql, forever))).rejects.toThrow(/already owned/);
    await as(performer);
    expect((await tx`update addon_purchases set fulfilled_at=now() returning id`).length).toBe(0);
    await as(owner);
    expect((await tx`update addon_purchases set fulfilled_at=now() returning id`).length).toBe(1);
    expect(await refused(tx, `update addon_purchases set price_aed=0`)).toBe(true);
    const [revenue] = await tx`select sum(credit)::float c from admin_ledger('2020-01-01','2030-01-01') where account='Subscription and credit revenue'`;
    expect(revenue!['c']).toBe(50);
  }));
});
