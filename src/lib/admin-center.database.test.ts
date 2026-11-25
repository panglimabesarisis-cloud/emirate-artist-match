// Master admin artist pages (0094) against the real schema on a fresh LOCAL database.
// Run with TEAM_ACCESS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/team_access_<name> (an empty database).
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['TEAM_ACCESS_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/team_access_')) throw new Error('Admin fixtures require a fresh local team_access_* database');
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;

const admin = randomUUID(), owner = randomUUID(), other = randomUUID();
const artist = randomUUID();
const rollback = new Error('rollback');
async function as(user: string, run: (tx: TransactionSql) => Promise<void>) {
  try {
    await db!.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${user},true), set_config('request.jwt.claim.role','authenticated',true)`;
      await tx.unsafe('SET LOCAL ROLE authenticated');
      await run(tx);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const refused = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return false; } catch { return true; }
};

describe.skipIf(!db)('0094 admin artist center', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    for (const [id, email] of [[admin, 'admin@example.test'], [owner, 'owner@example.test'], [other, 'other@example.test']] as const) await db!`insert into auth.users(id,email) values(${id},${email})`;
    await db!`insert into user_roles(user_id,role) values(${admin},'admin') on conflict do nothing`;
    // The booking trigger freezes the Free plan's 20% commission, so 1000 earns 800.
    // Pending on purpose: the admin must be able to review it before approval.
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${owner},'local-artist','Local Artist','pending')`;
    await db!`insert into artist_media(artist_id,kind,url,storage_path) values(${artist},'photo',${`${artist}/a.jpg`},${`${artist}/a.jpg`})`;
    await db!`insert into artist_portfolio(artist_id,title) values(${artist},'Work')`;
    await db!`insert into artist_clients(artist_id,name,is_public) values(${artist},'Private client',false)`;
    await db!`insert into storage.objects(bucket_id,name) values('artist-media',${`${artist}/a.jpg`})`;
    await db!`insert into quote_requests(artist_id,name,email,event_date) values(${artist},'Form client','form@example.test','2027-01-10')`;
    await db!`insert into conversations(artist_id,entry_source) values(${artist},'incoming_message'),(${artist},'test'),(${artist},'incoming_form')`;
    await db!`insert into bookings(artist_id,client_name,event_date,amount,total,status,commission_rate,is_seed) values
      (${artist},'A','2027-01-10',1000,1050,'completed',10,false),(${artist},'B','2027-01-11',500,525,'confirmed',10,false),
      (${artist},'C','2027-01-12',900,945,'cancelled',10,false),(${artist},'Seed','2027-01-13',5000,5250,'completed',10,true)`;
    await db!`insert into artist_profile_views(artist_id,visitor) values(${artist},${'a'.repeat(64)}),(${artist},${'b'.repeat(64)})`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('counts each artist the way the artist pages do', async () => {
    await as(admin, async tx => {
      const [row] = await tx`select * from admin_artist_stats() where artist_id=${artist}`;
      expect(row).toMatchObject({ plan_code: 'free', profile_views: '2', chat_income: '1', form_income: '1', invoice_sent: '0', revenue: '800.00', total_job: '2', job_done: '1' });
    });
  });

  it('shows a pending profile to the admin only', async () => {
    const counts = `select (select count(*) from artist_media where artist_id='${artist}')::int media, (select count(*) from artist_portfolio where artist_id='${artist}')::int works,
      (select count(*) from artist_clients where artist_id='${artist}')::int clients, (select count(*) from storage.objects where bucket_id='artist-media')::int files`;
    await as(admin, async tx => {
      expect((await tx.unsafe(counts))[0]).toEqual({ media: 1, works: 1, clients: 1, files: 1 });
      expect((await tx`select email from admin_artist_account(${artist})`)[0]?.['email']).toBe('owner@example.test');
    });
    await as(other, async tx => {
      expect((await tx.unsafe(counts))[0]).toEqual({ media: 0, works: 0, clients: 0, files: 0 });
      expect(await refused(tx, 'select * from admin_artist_stats()')).toBe(true);
      expect(await refused(tx, `select * from admin_artist_account('${artist}')`)).toBe(true);
      expect(await refused(tx, 'select * from artist_profile_views')).toBe(true);
    });
  });

  it('lets only the admin send a reminder and only the owner close it', async () => {
    const send = `insert into artist_profile_reminders(artist_id,missing,message) values('${artist}','{Tagline}','Please add a tagline')`;
    await as(owner, async tx => { expect(await refused(tx, send)).toBe(true); });
    await as(other, async tx => { expect(await refused(tx, send)).toBe(true); });
    await as(admin, async tx => { await tx.unsafe(send); });
    const [saved] = await db!`insert into artist_profile_reminders(artist_id,message) values(${artist},'Please add a photo') returning id`;
    const id = saved!['id'] as string;
    await as(other, async tx => {
      expect(await tx`select id from artist_profile_reminders`).toHaveLength(0);
      expect((await tx`select resolve_profile_reminder(${id}) ok`)[0]?.['ok']).toBe(false);
    });
    await as(owner, async tx => {
      expect(await tx`select id from artist_profile_reminders`).toHaveLength(1);
      expect(await tx`update artist_profile_reminders set message='changed' returning id`).toHaveLength(0);
      expect((await tx`select resolve_profile_reminder(${id}) ok`)[0]?.['ok']).toBe(true);
    });
  });

  it('allows suspension and keeps it out of the owner’s hands', async () => {
    await db!`update artists set status='suspended' where id=${artist}`;
    await as(owner, async tx => {
      await tx`update artists set status='approved' where id=${artist}`;
      expect((await tx`select status from artists where id=${artist}`)[0]?.['status']).toBe('suspended');
    });
  });
});
