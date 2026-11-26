// Account codes and the bank pause (0105) against every migration on a fresh LOCAL database.
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

const performer = randomUUID(), applicant = randomUUID(), client = randomUUID(), owner = randomUUID();
const artist = randomUUID(), draft = randomUUID();
const rollback = new Error('rollback');
type As = (user: string | null, role?: string) => Promise<void>;
async function transaction(run: (tx: TransactionSql, as: As) => Promise<void>) {
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
const grant = async (tx: TransactionSql, as: As, user: string, minutes = 10) => {
  await as(null, 'service_role');
  await tx`insert into account_otp_grants(user_id,expires_at) values(${user}, now() + make_interval(mins => ${minutes})) on conflict (user_id) do update set expires_at = excluded.expires_at`;
  await as(user);
};
const rename = (user: string) => `update profiles set display_name='Someone Else' where id='${user}'`;

describe.skipIf(!db)('0105 account codes and bank pause', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      if (file.startsWith('0098_')) {
        for (const [i, id] of [performer, applicant, client, owner].entries()) await db!`insert into auth.users(id,email) values(${id},${`otp${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    for (const [i, id] of [performer, applicant, client, owner].entries()) await db!`insert into profiles(id,display_name) values(${id},${`Person ${i}`}) on conflict (id) do update set display_name=excluded.display_name`;
    await db!`insert into user_roles(user_id,role) values(${performer},'artist'),(${applicant},'artist') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status,notify_phone,onboarding_complete) values(${artist},${performer},'otp-artist','Otp Artist','approved','+971501234567',false),(${draft},${applicant},'otp-draft','Draft','pending',null,false)`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('asks a registered talent for a code, and nobody else', () => transaction(async (tx, as) => {
    for (const [user, needed] of [[performer, true], [applicant, false], [client, false]] as const) {
      await as(user);
      expect((await tx`select needs_account_otp() n`)[0]!['n']).toBe(needed);
      expect(await refused(tx, rename(user))).toBe(needed);
    }
  }));

  it('lets the talent change the name, close the account and swap numbers only inside the window', () => transaction(async (tx, as) => {
    await tx`update profiles set phone='+971501234567' where id=${performer}`;
    await tx`update profiles set phone_verified_at=now() where id=${performer}`;
    const closure = `insert into account_closure_requests(user_id) values('${performer}')`;
    const swap = `update profiles set phone='+971509999999' where id='${performer}'`;
    await as(performer);
    expect(await refused(tx, closure)).toBe(true);
    expect(await refused(tx, swap)).toBe(true);
    expect(await refused(tx, `update profiles set phone='+971501234567' where id='${performer}'`)).toBe(false);
    expect(await refused(tx, `insert into account_otp_grants(user_id,expires_at) values('${performer}', now() + interval '1 day')`)).toBe(true);
    await grant(tx, as, performer, -1);
    expect(await refused(tx, rename(performer))).toBe(true);
    await grant(tx, as, performer);
    expect(await refused(tx, rename(performer))).toBe(false);
    expect(await refused(tx, closure)).toBe(false);
    expect(await refused(tx, swap)).toBe(false);
  }));

  it('keeps the booking number until a number is verified', () => transaction(async (tx, as) => {
    const change = `update artists set notify_phone='+971509999999' where id='${artist}'`;
    await as(performer);
    expect(await refused(tx, change)).toBe(true);
    expect(await refused(tx, `update artists set notify_phone='+971501234567', stage_name='Otp Artist' where id='${artist}'`)).toBe(false);
    await tx.unsafe('RESET ROLE');
    await tx`update profiles set phone='+971501234567' where id=${performer}`;
    await tx`update profiles set phone_verified_at=now() where id=${performer}`;
    await as(performer);
    expect(await refused(tx, change)).toBe(false);
  }));

  it('lets only the server write bank details and pauses withdrawals for three days after a real change', () => transaction(async (tx, as) => {
    const insert = `insert into artist_bank_details(artist_id,holder_name,bank_name,iban) values('${artist}','Holder','Bank','AE070331234567890123456')`;
    await grant(tx, as, performer);
    expect(await refused(tx, insert)).toBe(true);
    await as(null, 'service_role');
    await tx.unsafe(insert);
    await as(performer);
    expect((await tx`select * from artist_bank_details`).length).toBe(1);
    expect(await refused(tx, `update artist_bank_details set iban='AE000000000000000000000' where artist_id='${artist}'`)).toBe(true);
    expect(await refused(tx, `delete from artist_bank_details where artist_id='${artist}'`)).toBe(true);
    await tx.unsafe('RESET ROLE');
    await tx.unsafe('ALTER TABLE artist_bank_details DISABLE TRIGGER bank_details_touch');
    await tx`update artist_bank_details set updated_at = now() - interval '60 hours' where artist_id=${artist}`;
    await tx.unsafe('ALTER TABLE artist_bank_details ENABLE TRIGGER bank_details_touch');
    await as(performer);
    await expect(tx.savepoint(s => s`insert into payout_requests(artist_id,amount) values(${artist},1)`)).rejects.toThrow(/less than 3 days ago/);
    await as(null, 'service_role');
    const age = async () => (await tx`select round(extract(epoch from now() - updated_at) / 3600)::int h from artist_bank_details where artist_id=${artist}`)[0]!['h'];
    await tx`update artist_bank_details set holder_name='Holder' where artist_id=${artist}`;
    expect(await age()).toBe(60);
    await tx`update artist_bank_details set holder_name='New Holder' where artist_id=${artist}`;
    expect(await age()).toBe(0);
  }));
});
