// Admin permissions, audit log and finance reports (0098) against every migration on a fresh LOCAL database.
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

const owner = randomUUID(), staff = randomUUID(), fullStaff = randomUUID(), person = randomUUID(), client = randomUUID();
const artist = randomUUID(), booking = randomUUID();
const rollback = new Error('rollback');
async function as(user: string | null, run: (tx: TransactionSql) => Promise<void>, role = 'authenticated') {
  try {
    await db!.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${user ?? ''},true), set_config('request.jwt.claim.role',${role},true), set_config('request.headers',${'{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"Test Browser"}'},true), set_config('request.path','/rest/v1/test',true)`;
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      await run(tx);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const count = async (tx: TransactionSql, query: string) => (await tx.unsafe(query)).length;
const refused = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return false; } catch { return true; }
};

describe.skipIf(!db)('0098 admin permissions, audit and finance', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      // The owner exists before 0098, exactly as in production.
      if (file.startsWith('0098_')) {
        for (const [i, id] of [owner, staff, fullStaff, person, client].entries()) await db!`insert into auth.users(id,email) values(${id},${`user${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    await db!`insert into user_roles(user_id,role) values(${staff},'admin'),(${fullStaff},'admin'),(${client},'client') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${person},'perm-artist','Perm Artist','pending')`;
    await db!`insert into bookings(id,artist_id,client_user_id,client_name,event_date,amount,vat_amount,total,paid_amount,status,escrow_status,commission_rate,client_commission_pct,paid_at,completed_at,escrow_released_at)
      values(${booking},${artist},${client},'Client','2027-01-10',1000,50,1050,1050,'completed','released',10,2,now(),now(),now())`;
    await db!`update bookings set client_commission_pct=2 where id=${booking}`;
    await db!`insert into bookings(artist_id,client_name,event_date,amount,vat_amount,total,paid_amount,status) values(${artist},'Half payer','2027-01-11',500,25,525,100,'confirmed')`;
    await db!`insert into payment_orders(artist_id,kind,target_id,amount_minor,currency,environment,status,paid_at) values(${artist},'booking',${booking},105000,'aed','sandbox','paid',now()),(${artist},'credits',null,10500,'aed','sandbox','paid',now())`;
    // Staff may read artists but not change them, and has no finance access at all.
    await db!`insert into admin_permissions(user_id,module,can_read,can_edit,can_delete) values(${staff},'artists',true,false,false),(${staff},'finance',false,false,false),(${staff},'administration',false,false,false)`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('leaves no row rule that only asks for the admin role', async () => {
    const left = await db!`select tablename, policyname from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'has_role\\([^)]*admin'`;
    expect(left.map(r => `${r['tablename']}.${r['policyname']}`)).toEqual([]);
  });

  it('keeps full access for an owner and an admin without saved permissions', async () => {
    for (const user of [owner, fullStaff]) await as(user, async tx => {
      expect(await count(tx, `select id from artists where id='${artist}'`)).toBe(1);
      expect((await tx.unsafe(`update artists set tagline='x' where id='${artist}' returning id`)).length).toBe(1);
      expect(await count(tx, 'select id from payment_orders')).toBe(2);
      expect(await refused(tx, 'select admin_finance_page()')).toBe(false);
    });
  });

  it('enforces read, edit and delete per module', async () => {
    await as(staff, async tx => {
      expect(await count(tx, `select id from artists where id='${artist}'`)).toBe(1);
      expect((await tx.unsafe(`update artists set tagline='y' where id='${artist}' returning id`)).length).toBe(0);
      expect((await tx.unsafe(`delete from categories returning id`)).length).toBe(0);
      expect(await refused(tx, `insert into categories(name,slug) values('Staff','staff')`)).toBe(true);
      expect(await count(tx, 'select id from payment_orders')).toBe(0);
      expect(await refused(tx, 'select admin_finance_page()')).toBe(true);
      expect(await refused(tx, `select * from admin_ledger('2020-01-01','2028-01-01')`)).toBe(true);
      expect(await refused(tx, 'select * from admin_users()')).toBe(true);
      // Not restricted: settings.
      expect(await refused(tx, `insert into site_settings(key,value) values('staff-test','{}')`)).toBe(false);
    });
  });

  it('keeps visitors and ordinary accounts as they were', async () => {
    await as(null, async tx => { expect(await count(tx, 'select code from plan_tiers')).toBeGreaterThan(0); expect(await count(tx, `select id from artists where id='${artist}'`)).toBe(0); }, 'anon');
    await as(person, async tx => { expect((await tx.unsafe(`update artists set tagline='own words' where id='${artist}' returning id`)).length).toBe(1); expect(await count(tx, 'select id from payment_orders')).toBe(2); });
    await as(client, async tx => { expect(await count(tx, 'select id from payment_orders')).toBe(0); expect(await refused(tx, 'select * from admin_users()')).toBe(true); });
  });

  it('protects the owner and stops self-granting', async () => {
    const grant = (target: string) => `insert into admin_permissions(user_id,module,can_read,can_edit,can_delete) values('${target}','library',false,false,false)`;
    await as(owner, async tx => { expect(await refused(tx, grant(owner))).toBe(true); expect(await refused(tx, grant(fullStaff))).toBe(false); });
    await as(fullStaff, async tx => {
      expect(await refused(tx, grant(owner))).toBe(true);
      expect(await refused(tx, grant(fullStaff))).toBe(true);
      expect(await refused(tx, `delete from user_roles where user_id='${owner}' and role='admin'`)).toBe(true);
    });
    await as(staff, async tx => { expect(await refused(tx, grant(fullStaff))).toBe(true); expect((await tx.unsafe(`delete from admin_permissions where user_id='${staff}' returning module`)).length).toBe(0); });
  });

  it('records admin views and changes with address and browser, readable and not writable', async () => {
    await as(owner, async tx => {
      await tx`select log_admin_view('/admin#ledger','finance')`;
      await tx.unsafe(`update artists set featured=true where id='${artist}'`);
      const rows = await tx`select action, ip, browser, url, security from admin_audit_log order by id desc limit 2`;
      expect(rows.map(r => r['action'])).toEqual(['Update artists', 'Opened page']);
      expect(rows[1]).toMatchObject({ ip: '203.0.113.9', browser: 'Test Browser', url: '/admin#ledger', security: 'info' });
      expect(await refused(tx, `insert into admin_audit_log(action) values('forged')`)).toBe(true);
      expect(await refused(tx, 'delete from admin_audit_log')).toBe(true);
    });
    await as(person, async tx => { await tx.unsafe(`update artists set tagline='z' where id='${artist}'`); await tx.unsafe('RESET ROLE'); expect((await tx`select count(*)::int n from admin_audit_log where user_id=${person}`)[0]!['n']).toBe(0); });
    await as(client, async tx => { expect(await count(tx, 'select id from admin_audit_log')).toBe(0); expect(await refused(tx, `select log_admin_view('/x','finance')`)).toBe(true); });
  });

  it('shows only fully paid invoices when asked', async () => {
    await as(owner, async tx => {
      const [all] = await tx`select admin_finance_page(0,'','all',false) page`;
      const [paid] = await tx`select admin_finance_page(0,'','all',true) page`;
      expect((all!['page'] as { total: number }).total).toBe(2);
      expect((paid!['page'] as { total: number }).total).toBe(1);
    });
  });

  it('splits the platform fee between client commission and revenue', async () => {
    await as(owner, async tx => {
      const [row] = await tx`select * from admin_client_commissions()`;
      expect(row).toMatchObject({ total: '1050', fee: '200.00', commission: '20.00', revenue: '180.00', commission_status: 'available' });
    });
  });

  it('keeps every journal balanced', async () => {
    await db!`insert into test_refunds(order_id,processor_amount,accounting_amount,status) select id,5250,5250,'succeeded' from payment_orders where kind='credits'`;
    await as(owner, async tx => {
      const lines = await tx`select journal, account, debit::float d, credit::float c from admin_ledger('2020-01-01','2028-01-01')`;
      expect(lines.length).toBeGreaterThan(5);
      const journals = new Map<string, number>();
      for (const line of lines) journals.set(line['journal'] as string, (journals.get(line['journal'] as string) ?? 0) + Math.round((Number(line['d']) - Number(line['c'])) * 100));
      expect([...journals.values()].every(v => v === 0)).toBe(true);
      const sum = (account: string, key: 'd' | 'c') => lines.filter(l => l['account'] === account).reduce((n, l) => n + Number(l[key]), 0);
      // The booking trigger froze the Free plan's 20% commission.
      expect(sum('Artist payable', 'c')).toBe(800);
      expect(sum('Platform commission revenue', 'c')).toBe(200);
      expect(sum('Customer funds held in escrow', 'c') - sum('Customer funds held in escrow', 'd')).toBe(0);
      expect(sum('Subscription and credit revenue', 'c')).toBe(100);
      // A refunded purchase reverses its revenue and its VAT separately.
      expect(sum('Subscription and credit revenue', 'd')).toBe(50);
      expect(sum('VAT payable (5%)', 'd')).toBe(2.5);
    });
  });

  it('reports subscriptions, usage and credit statistics to entitled admins', async () => {
    await as(owner, async tx => {
      expect((await tx`select * from admin_subscriptions() where artist_id=${artist}`)[0]).toMatchObject({ plan_code: 'free' });
      const [usage] = await tx`select admin_subscription_usage(${artist}) u`;
      expect((usage!['u'] as { used: Record<string, number>; plan: { code: string } }).plan.code).toBe('free');
      const [credits] = await tx`select admin_credit_usage(30) c`;
      expect((credits!['c'] as { daily: unknown[] }).daily).toHaveLength(30);
      expect((await tx`select user_id, is_owner from admin_users() where user_id=${owner}`)[0]!['is_owner']).toBe(true);
    });
    await as(client, async tx => { expect(await refused(tx, 'select admin_credit_usage(30)')).toBe(true); expect(await refused(tx, 'select * from admin_subscriptions()')).toBe(true); });
  });
});
