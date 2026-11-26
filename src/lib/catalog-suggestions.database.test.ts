// Talent category and speciality requests (0104) against every migration on a fresh LOCAL database.
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
const artist = randomUUID(), rival = randomUUID(), djs = randomUUID(), wedding = randomUUID();
const rollback = new Error('rollback');
type As = (user: string) => Promise<void>;
async function transaction(run: (tx: TransactionSql, as: As) => Promise<void>) {
  try {
    await db!.begin(async tx => {
      await run(tx, async user => {
        await tx.unsafe('RESET ROLE');
        await tx`select set_config('request.jwt.claim.sub',${user},true), set_config('request.jwt.claim.role','authenticated',true)`;
        await tx.unsafe('SET LOCAL ROLE authenticated');
      });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const refused = async (tx: TransactionSql, query: string) => {
  try { await tx.savepoint(s => s.unsafe(query)); return false; } catch { return true; }
};
const ask = async (tx: TransactionSql, kind: string, name: string, category: string | null = null, parent: string | null = null) =>
  (await tx`select suggest_catalog_entry(${artist},${kind},${name},${category},${parent}) id`)[0]!['id'] as string;
const decide = async (tx: TransactionSql, id: string, approve = true, name: string | null = null, note: string | null = null) =>
  (await tx`select decide_catalog_suggestion(${id},${approve},${name},${note}) added`)[0]!['added'] as boolean;
const profile = async (tx: TransactionSql) => (await tx`select category_id, category_ids, subcategory_id, specialty_ids from private_artists() where id=${artist}`)[0]!;

describe.skipIf(!db)('0104 catalogue suggestions', () => {
  beforeAll(async () => {
    await db!.unsafe(readFileSync('docs/database-tests/supabase-local-bootstrap.sql', 'utf8'));
    for (const file of readdirSync('drizzle/migrations').filter(name => name.endsWith('.sql')).sort()) {
      if (file.startsWith('0018_')) await db!.unsafe(readFileSync('docs/database-tests/supabase-local-before-0018.sql', 'utf8'));
      if (file.startsWith('0098_')) {
        for (const [i, id] of [owner, performer, other].entries()) await db!`insert into auth.users(id,email) values(${id},${`catalog${i}@example.test`})`;
        await db!`insert into user_roles(user_id,role) values(${owner},'admin') on conflict do nothing`;
      }
      await db!.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    }
    await db!`insert into categories(id,name,slug) values(${djs},'Test DJs','test-djs')`;
    await db!`insert into subcategories(id,category_id,name,slug) values(${wedding},${djs},'Wedding DJ','wedding-dj')`;
    await db!`insert into user_roles(user_id,role) values(${performer},'artist'),(${other},'artist') on conflict do nothing`;
    await db!`insert into artists(id,user_id,slug,stage_name,status) values(${artist},${performer},'catalog-artist','Catalog Artist','approved'),(${rival},${other},'catalog-rival','Rival','approved')`;
    await db!`update plan_tiers set max_categories=1, max_specialties=2 where code='free'`;
    await db!`update artists set category_id=${djs}, subcategory_id=${wedding} where id=${artist}`;
  }, 120_000);
  afterAll(async () => { await db?.end(); });

  it('takes clean requests from the talent only and keeps them private', () => transaction(async (tx, as) => {
    await as(performer);
    const id = await ask(tx, 'speciality', '  Desert   DJ ', djs);
    expect(await ask(tx, 'speciality', 'desert dj', djs)).toBe(id);
    for (const [kind, name, category] of [['speciality', 'wedding dj', djs], ['category', 'test djs', null], ['category', 'x', null], ['category', '<b>', null], ['speciality', 'Orphan', null]] as const)
      expect(await refused(tx, `select suggest_catalog_entry('${artist}','${kind}','${name}',${category ? `'${category}'` : 'null'})`), name).toBe(true);
    expect(await refused(tx, `insert into catalog_suggestions(artist_id,kind,name,status) values('${artist}','category','Direct','approved')`)).toBe(true);
    expect(await refused(tx, `update catalog_suggestions set status='approved'`)).toBe(true);
    expect(await refused(tx, `select decide_catalog_suggestion('${id}',true)`)).toBe(true);
    expect((await tx`select * from subcategories where name='Desert DJ'`).length).toBe(0);
    await as(other);
    expect(await refused(tx, `select suggest_catalog_entry('${artist}','category','Not mine')`)).toBe(true);
    expect((await tx`select * from catalog_suggestions`).length).toBe(0);
    expect((await tx`delete from catalog_suggestions returning id`).length).toBe(0);
    await as(performer);
    expect((await tx`delete from catalog_suggestions returning id`).length).toBe(1);
  }));

  it('stops at ten waiting requests', () => transaction(async (tx, as) => {
    await as(performer);
    for (let i = 0; i < 10; i++) await ask(tx, 'category', `Idea ${i}`);
    expect(await refused(tx, `select suggest_catalog_entry('${artist}','category','One too many')`)).toBe(true);
  }));

  it('adds an approved speciality to the catalogue and the profile when there is room', () => transaction(async (tx, as) => {
    await as(performer);
    const first = await ask(tx, 'speciality', 'Desert DJ', djs), second = await ask(tx, 'speciality', 'Yacht DJ', djs);
    await as(owner);
    expect(await decide(tx, first)).toBe(true);
    // The free plan here holds two specialities, so the next one is listed but not put on the profile.
    expect(await decide(tx, second, true, 'Yacht Party DJ')).toBe(false);
    expect(await refused(tx, `select decide_catalog_suggestion('${first}',true)`)).toBe(true);
    const listed = await tx`select name, slug from subcategories where category_id=${djs} order by name`;
    expect(listed.map(r => r['slug'])).toEqual(['desert-dj', 'wedding-dj', 'yacht-party-dj']);
    await as(performer);
    expect((await profile(tx))['specialty_ids']).toHaveLength(2);
  }));

  it('approves a new category before its specialities and never exceeds the plan', () => transaction(async (tx, as) => {
    await as(performer);
    const category = await ask(tx, 'category', 'Fire Shows');
    const child = await ask(tx, 'speciality', 'Fire Dancer', null, category);
    await as(owner);
    expect(await refused(tx, `select decide_catalog_suggestion('${child}',true)`)).toBe(true);
    expect(await decide(tx, category)).toBe(false);
    expect(await decide(tx, child)).toBe(false);
    expect((await tx`select s.name from subcategories s join categories c on c.id=s.category_id where c.slug='fire-shows'`).map(r => r['name'])).toEqual(['Fire Dancer']);
    await as(performer);
    const kept = await profile(tx);
    expect([kept['category_id'], kept['specialty_ids']]).toEqual([djs, [wedding]]);
  }));

  it('gives a talent without a category the approved one', () => transaction(async (tx, as) => {
    await tx`update artists set category_id=null, subcategory_id=null, category_ids='{}', specialty_ids='{}' where id=${artist}`;
    await as(performer);
    const category = await ask(tx, 'category', 'Fire Shows');
    const child = await ask(tx, 'speciality', 'Fire Dancer', null, category);
    await as(owner);
    expect(await decide(tx, category)).toBe(true);
    expect(await decide(tx, child)).toBe(true);
    await as(performer);
    const saved = await profile(tx);
    expect(saved['category_id']).not.toBeNull();
    expect(saved['specialty_ids']).toEqual([saved['subcategory_id']]);
  }));

  it('rejects with a reason, together with the specialities that depended on it', () => transaction(async (tx, as) => {
    await as(performer);
    const category = await ask(tx, 'category', 'Fire Shows');
    await ask(tx, 'speciality', 'Fire Dancer', null, category);
    await as(owner);
    expect(await refused(tx, `select decide_catalog_suggestion('${category}',false)`)).toBe(true);
    await decide(tx, category, false, null, 'Covered by Dancers');
    await as(performer);
    expect((await tx`select status, admin_note from catalog_suggestions`).map(r => `${r['status']} ${r['admin_note']}`)).toEqual(['rejected Covered by Dancers', 'rejected Covered by Dancers']);
    expect((await tx`select * from categories where slug='fire-shows'`).length).toBe(0);
  }));
});
