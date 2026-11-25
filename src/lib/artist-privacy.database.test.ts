// Private artist columns (0095, 0096), against the real schema on a fresh LOCAL database.
// Run with ARTIST_PRIVACY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/artist_privacy_<name> (an empty database).
// The migrations are applied in the rollout order, and everything the other tables allow is compared before and after.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env['ARTIST_PRIVACY_TEST_DATABASE_URL'];
if (connection) {
  const target = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/artist_privacy_')) throw new Error('Privacy fixtures require a fresh local artist_privacy_* database');
}
const db = connection ? postgres(connection, { max: 1, ssl: false, onnotice: () => {} }) : null;

/** Every column the client roles may read. A new column stays private until it is added here and granted. */
const PUBLIC_COLUMNS = ['area_id', 'bio', 'body', 'category_id', 'category_ids', 'created_at', 'emirate_id', 'event_type_slugs', 'featured', 'hue', 'id',
  'languages', 'photo_path', 'plan', 'response_rate', 'skills', 'slug', 'specialty_ids', 'stage_name', 'status', 'subcategory_id', 'tagline', 'travel_radius_km'];
const PRIVATE_COLUMNS = ['base_price', 'calendar_token', 'contract_accepted_at', 'intended_plan', 'is_seed', 'manager_phone', 'notify_phone', 'onboarding_complete',
  'registration_paid_at', 'travel_fee_per_step', 'travel_step_km', 'travel_surcharge_enabled', 'trn', 'user_id'];

const USERS = ['owner', 'otherOwner', 'pendingOwner', 'member', 'invited', 'suspended', 'client', 'admin'] as const;
type Actor = (typeof USERS)[number] | 'anon';
const ACTORS: Actor[] = ['anon', ...USERS];
const userOf = Object.fromEntries(USERS.map(name => [name, randomUUID()])) as Record<(typeof USERS)[number], string>;
const mine = randomUUID(), theirs = randomUUID(), pending = randomUUID();
const conversation = randomUUID(), quote = randomUUID(), booking = randomUUID(), job = randomUUID();
const FIXTURES = `id in ('${mine}','${theirs}','${pending}')`;

const rollback = new Error('rollback');
async function as<T>(actor: Actor, run: (tx: TransactionSql) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db!.begin(async tx => {
      const role = actor === 'anon' ? 'anon' : 'authenticated';
      await tx`select set_config('request.jwt.claim.sub',${actor === 'anon' ? '' : userOf[actor]},true), set_config('request.jwt.claim.role',${role},true)`;
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      result = await run(tx);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return result;
}
/** The number of rows a statement returns, or why it was refused; nothing it changes is kept. */
async function outcome(tx: TransactionSql, query: string): Promise<string> {
  let rows = 0;
  try {
    await tx.savepoint(async s => { rows = (await s.unsafe(query)).length; throw rollback; });
  } catch (error) {
    if (error !== rollback) return (error as Error).message;
  }
  return `${rows} rows`;
}
const denied = 'permission denied for table artists';

/** What every actor may read, change and add across the whole schema. */
async function snapshot() {
  const tables = await db!`select format('%I.%I', n.nspname, c.relname) as name,
      exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='artist_id' and not a.attisdropped) as owned
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','v') and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) order by 1`;
  const statements = tables.flatMap(table => {
    const name = String(table['name']);
    const reads = [name === 'public.artists' ? 'select id from public.artists' : `select 1 from ${name}`];
    return table['owned'] ? [...reads, `update ${name} set artist_id=artist_id returning 1`, `delete from ${name} returning 1`] : reads;
  });
  statements.push(
    'select * from artist_public_stats()',
    `update artists set tagline=tagline where id='${mine}' returning id`,
    `insert into availability(artist_id,date) values('${mine}','2027-05-01') returning 1`,
    `insert into rate_cards(artist_id,title,price) values('${mine}','Added',10) returning 1`,
    `insert into verification_applications(artist_id,badge_type,status) values('${mine}','verified_business','submitted') returning 1`,
    `insert into quote_requests(artist_id,name,email,event_date,status) values('${mine}','New','new@example.test','2027-05-02','new') returning 1`,
  );
  const seen: Record<string, string> = {};
  for (const actor of ACTORS) await as(actor, async tx => {
    for (const statement of statements) seen[`${actor}: ${statement}`] = await outcome(tx, statement);
  });
  return seen;
}

const migrations = readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort();
async function apply(files: string[]) {
  for (const file of files) {
    if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
    await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
  }
}

let before: Record<string, string>, step1: Record<string, string>, after: Record<string, string>;
let leakedBefore = '';

describe.skipIf(!db)('private artist columns', () => {
  beforeAll(async () => {
    const [existing] = await db!`select to_regclass('public.artists') as found`;
    if (existing?.['found']) throw new Error('Use an empty database: the schema is already there');
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    await apply(migrations.filter(name => name < '0095'));
    await db!.unsafe('update plan_tiers set max_team_members=1000, max_photos=1000, max_videos=1000, max_portfolio=1000, max_clients=1000');
    for (const [name, id] of Object.entries(userOf)) await db!`insert into auth.users(id,email) values(${id},${`${name}@example.test`})`;
    await db!`insert into user_roles(user_id,role) values(${userOf.admin},'admin') on conflict do nothing`;
    for (const [artist, ownerName, status] of [[mine, 'owner', 'approved'], [theirs, 'otherOwner', 'approved'], [pending, 'pendingOwner', 'pending']] as const) {
      await db!`insert into artists(id,user_id,slug,stage_name,status,base_price,trn,notify_phone,manager_phone,contract_accepted_at,registration_paid_at,intended_plan)
        values(${artist},${userOf[ownerName]},${`seed-${artist}`},'Seed Artist',${status},1500,'100000000000003','+971500000001','+971500000002',now(),now(),'basic')`;
      await db!`insert into availability(artist_id,date) values(${artist},'2027-02-01')`;
      await db!`insert into rate_cards(artist_id,title,price) values(${artist},'Set',1000)`;
      await db!`insert into stat_visibility(artist_id) values(${artist}) on conflict do nothing`;
      await db!`insert into agent_settings(artist_id) values(${artist}) on conflict do nothing`;
      await db!`insert into verification_applications(artist_id,badge_type,status) values(${artist},'verified_identity','submitted')`;
      await db!`insert into reviews(artist_id,client_name,rating) values(${artist},'Reviewer',5)`;
      await db!`insert into artist_media(artist_id,kind,url) values(${artist},'photo',${`${artist}/photo.jpg`})`;
      await db!`insert into artist_portfolio(artist_id,title) values(${artist},'Work')`;
      await db!`insert into artist_clients(artist_id,name,is_public) values(${artist},'Client',true)`;
      await db!`insert into artist_order_forms(artist_id,enabled) values(${artist},true) on conflict do nothing`;
      await db!`insert into storage.objects(bucket_id,name) values('artist-media',${`${artist}/photo.jpg`})`;
    }
    await db!`insert into quote_requests(id,artist_id,client_user_id,name,email,event_date) values(${quote},${mine},${userOf.client},'Quote Client','client@example.test','2027-01-10')`;
    await db!`insert into conversations(id,artist_id,quote_request_id,client_user_id,client_name) values(${conversation},${mine},${quote},${userOf.client},'Chat Client')`;
    await db!`insert into messages(conversation_id,sender,body) values(${conversation},'client','Hello')`;
    await db!`insert into bookings(id,artist_id,conversation_id,client_user_id,client_name,client_email,event_date,amount,status) values(${booking},${mine},${conversation},${userOf.client},'Booking Client','client@example.test','2027-01-10',1000,'quoted')`;
    await db!`insert into disputes(booking_id,opened_by,reason) values(${booking},'client','Late')`;
    await db!`insert into service_invoices(artist_id,conversation_id,number,document,total) values(${mine},${conversation},'INV-PRIVACY','{}',100)`;
    await db!`insert into open_jobs(id,client_user_id,title,brief,event_date,start_time,end_time,venue,budget_aed) values(${job},${userOf.client},'MC','Gala','2027-06-01','18:00','20:00','Dubai',1000)`;
    await db!`insert into job_applications(job_id,artist_id) values(${job},${mine})`;
    const [role] = await db!`insert into team_roles(artist_id,name,menus) values(${mine},'Invoices','{inbox,invoices,bookings}') returning id`;
    for (const name of ['member', 'invited', 'suspended'] as const) {
      await db!`insert into artist_members(artist_id,email,role,user_id,status,role_id) values(${mine},${`${name}@example.test`},'assistant',${userOf[name]},${name === 'member' ? 'active' : name},${role!['id']})`;
    }

    leakedBefore = await as('anon', tx => outcome(tx, `select user_id,notify_phone,manager_phone,trn from artists where id='${mine}'`));
    before = await snapshot();
    await apply(migrations.filter(name => name.startsWith('0095_')));
    step1 = await snapshot();
    await apply(migrations.filter(name => name >= '0096'));
    after = await snapshot();
  }, 240_000);
  afterAll(async () => { await db?.end(); });

  it('starts from a database where anyone could read the private columns', () => expect(leakedBefore).toBe('1 rows'));

  it('grants the client roles exactly the public columns', async () => {
    const columns = await db!`select column_name from information_schema.columns where table_schema='public' and table_name='artists' order by 1`;
    expect(columns.map(column => column['column_name'])).toEqual([...PUBLIC_COLUMNS, ...PRIVATE_COLUMNS].sort());
    for (const role of ['anon', 'authenticated']) {
      const granted = await db!`select column_name from information_schema.columns where table_schema='public' and table_name='artists' and has_column_privilege(${role},'public.artists',column_name,'SELECT') order by 1`;
      expect(granted.map(column => column['column_name']), role).toEqual(PUBLIC_COLUMNS);
    }
  });

  describe.each(ACTORS)('%s', actor => {
    it('cannot read, filter on or select past a private column', () => as(actor, async tx => {
      for (const column of PRIVATE_COLUMNS) {
        expect(await outcome(tx, `select ${column} from artists`), column).toBe(denied);
        expect(await outcome(tx, `select id from artists where ${column} is not null`), column).toBe(denied);
      }
      expect(await outcome(tx, 'select * from artists')).toBe(denied);
      expect(await outcome(tx, `update artists set tagline=tagline where id='${mine}' returning trn`)).toBe(denied);
    }));
    it('still reads what the public search, profile and chat pages show', () => as(actor, async tx => {
      const cards = await tx.unsafe(`select ${PUBLIC_COLUMNS.map(column => `a.${column}`).join(',')}, c.slug category, s.slug subcategory, e.slug emirate, r.slug area
        from artists a left join categories c on c.id=a.category_id left join subcategories s on s.id=a.subcategory_id
        left join emirates e on e.id=a.emirate_id left join areas r on r.id=a.area_id where a.status='approved' and a.slug like 'seed-%'`);
      expect(cards.map(card => card['id']).sort()).toEqual([mine, theirs].sort());
      expect((await tx`select artist_id from artist_public_stats() where artist_id=${mine}`).length).toBe(1);
    }));
  });

  const whole = (tx: TransactionSql) => tx.unsafe(`select id,user_id,base_price,trn,notify_phone,manager_phone,intended_plan,registration_paid_at,contract_accepted_at,calendar_token from private_artists() where ${FIXTURES}`);
  it.each<[Actor, string[]]>([['owner', [mine]], ['member', [mine]], ['otherOwner', [theirs]], ['pendingOwner', [pending]], ['admin', [mine, theirs, pending]], ['client', []], ['invited', []], ['suspended', []]])(
    'gives %s the whole row of their own artists only', (actor, expected) => as(actor, async tx => {
      const rows = await whole(tx);
      expect(rows.map(row => row['id']).sort()).toEqual([...expected].sort());
      for (const row of rows) expect(row).toMatchObject({ base_price: '1500.00', trn: '100000000000003', notify_phone: '+971500000001', manager_phone: '+971500000002', intended_plan: 'basic' });
    }));
  it('refuses private_artists() to a visitor', () => as('anon', async tx => {
    expect(await outcome(tx, 'select * from private_artists()')).toBe('permission denied for function private_artists');
  }));
  it('finds the signed-in artist by account, as the dashboard does', () => as('owner', async tx => {
    expect((await tx`select id from private_artists() where user_id=${userOf.owner}`).map(row => row['id'])).toEqual([mine]);
  }));
  it('keeps the owner able to save the private settings', () => as('owner', async tx => {
    expect(await outcome(tx, `update artists set notify_phone=null, manager_phone=null, trn='100000000000004', base_price=2000, intended_plan='free' where id='${mine}' returning id`)).toBe('1 rows');
  }));
  it('keeps the server reading every column', async () => {
    const [grant] = await db!`select bool_and(has_column_privilege('service_role','public.artists',column_name,'SELECT')) as every from information_schema.columns where table_schema='public' and table_name='artists'`;
    expect(grant?.['every']).toBe(true);
  });

  it('leaves every other read and write as it was after the first step', () => expect(step1).toEqual(before));
  it('leaves every other read and write as it was after the columns are closed', () => {
    expect(Object.entries(after).filter(([, result]) => result === denied)).toEqual([]);
    expect(after).toEqual(before);
  });
  it('compares real access, not only refusals', () => {
    for (const statement of [`insert into availability(artist_id,date) values('${mine}','2027-05-01') returning 1`, `insert into rate_cards(artist_id,title,price) values('${mine}','Added',10) returning 1`, `update artists set tagline=tagline where id='${mine}' returning id`]) {
      expect(after[`owner: ${statement}`]).toBe('1 rows');
      expect(after[`client: ${statement}`]).not.toBe('1 rows');
    }
    expect(after['owner: select 1 from public.service_invoices']).toBe('1 rows');
    expect(after['member: select 1 from public.service_invoices']).toBe('1 rows');
  });
});
