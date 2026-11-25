// Security scan findings enforced by the database (0097), against every migration on a fresh LOCAL database.
// Run with TEAM_ACCESS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/team_access_<name> (an empty database).
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['TEAM_ACCESS_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/team_access_')) throw new Error('Security fixtures require a fresh local team_access_* database');
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;

const admin = randomUUID(), admin2 = randomUUID(), owner = randomUUID(), member = randomUUID(), stranger = randomUUID();
const artist = randomUUID(), adminArtist = randomUUID();
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
const value = async (tx: TransactionSql, query: string) => (await tx.unsafe(query))[0]?.['v'];
const refusal = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return null; } catch (error) { return (error as Error).message; }
};

describe.skipIf(!db)('0097 security findings', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    for (const [i, id] of [admin, admin2, owner, member, stranger].entries()) await db!`insert into auth.users(id,email) values(${id},${`user${i}@example.test`})`;
    for (const id of [admin, admin2]) await db!`insert into user_roles(user_id,role) values(${id},'admin') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${owner},'sec-artist','Sec Artist','pending'),(${adminArtist},${admin},'sec-admin-artist','Admin Artist','pending')`;
    await db!`insert into artist_subscriptions(id,artist_id,customer_id,plan_code,billing_interval,environment,status,period_start,period_end,paid_until,paid_from)
      values('sub_sec',${artist},'cus_sec','pro','month','sandbox','active',now(),now()+interval '30 days',now()+interval '30 days',now())`;
    await db!`insert into artist_members(artist_id,user_id,email,status) values(${artist},${member},'user3@example.test','active')`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('tells a user only about their own role', async () => {
    const mine = (id: string) => `select has_role('${id}','admin') v`;
    await as(stranger, async tx => { expect(await value(tx, mine(admin))).toBe(false); });
    await as(null, async tx => { expect(await value(tx, mine(admin))).toBe(false); }, 'anon');
    await as(admin, async tx => { expect(await value(tx, mine(admin))).toBe(true); expect(await value(tx, mine(admin2))).toBe(false); });
    await as(null, async tx => { expect(await value(tx, mine(admin))).toBe(true); }, 'service_role');
  });

  it('shows a plan only to the artist, their team, the admin and the server', async () => {
    const plan = `select effective_artist_plan('${artist}') v`;
    await as(stranger, async tx => {
      expect(await value(tx, plan)).toBeNull();
      expect(await refusal(tx, `select artist_plan_internal('${artist}')`)).toMatch(/permission denied/);
    });
    for (const user of [owner, member, admin]) await as(user, async tx => { expect(await value(tx, plan)).toBe('pro'); });
    await as(null, async tx => { expect(await value(tx, plan)).toBe('pro'); }, 'service_role');
  });

  it('keeps database rules on the real plan whoever triggers them', async () => {
    // A signed-in client's booking still freezes the Pro commission, not the Free one.
    await as(stranger, async tx => {
      await tx.unsafe('RESET ROLE');
      await tx.unsafe(`insert into bookings(artist_id,client_name,event_date,amount,total,status) values('${artist}','Client','2027-02-01',100,105,'quoted')`);
      const [pro] = await tx`select commission_pct from plan_tiers where code='pro'`;
      expect(Number(await value(tx, `select commission_rate v from bookings where artist_id='${artist}'`))).toBe(Number(pro!['commission_pct']));
    });
    const [left] = await db!`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and prosrc like '%effective_artist_plan(%' and proname<>'effective_artist_plan'`;
    expect(left!['n']).toBe(0);
  });

  it('stops an admin approving, featuring or badging their own profile', async () => {
    await as(admin, async tx => {
      for (const change of [`status='approved'`, 'featured=true', 'registration_paid_at=now()', `user_id='${stranger}'`]) {
        expect(await refusal(tx, `update artists set ${change} where id='${adminArtist}'`)).toMatch(/Another administrator/);
      }
      expect(await refusal(tx, `insert into artist_badges(artist_id,badge) values('${adminArtist}','verified_identity')`)).toMatch(/Another administrator/);
      expect(await refusal(tx, `update artists set tagline='My own words' where id='${adminArtist}'`)).toBeNull();
      expect(await refusal(tx, `update artists set status='approved' where id='${artist}'`)).toBeNull();
    });
    await as(admin2, async tx => { expect(await refusal(tx, `update artists set status='approved' where id='${adminArtist}'`)).toBeNull(); });
    // The second administrator has no profile yet and cannot create an already approved one for themselves.
    await as(admin2, async tx => {
      expect(await refusal(tx, `insert into artists(user_id,slug,stage_name,status) values('${admin2}','sec-self','Self','approved')`)).toMatch(/Another administrator/);
    });
  });

  it('stops an admin approving their own identity application', async () => {
    const [row] = await db!`insert into verification_applications(artist_id,badge_type,status) values(${adminArtist},'verified_identity','submitted') returning id`;
    const approve = `update verification_applications set status='approved' where id='${row!['id']}'`;
    await as(admin, async tx => { expect(await refusal(tx, approve)).toMatch(/Another administrator/); });
    await as(admin2, async tx => { expect(await refusal(tx, approve)).toBeNull(); });
  });
});
