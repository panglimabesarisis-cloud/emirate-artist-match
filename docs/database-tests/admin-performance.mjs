// Read-only regression check: runs the deployed aggregate SQL against VALUES fixtures.
// No app records, sessions, schema or invoice files are written.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const migration = readFileSync("drizzle/migrations/0079_admin_artist_performance_analytics.sql", "utf8");
const start = migration.indexOf("WITH selected_artists");
const end = migration.indexOf(" INTO result;", start);
assert.ok(start >= 0 && end > start, "Analytics aggregate must be present");
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const fixtures = `WITH
  fixture_artists(id,stage_name,plan,is_seed) AS (VALUES ('${a}'::uuid,'Artist A','pro',false),('${b}'::uuid,'Artist B','free',false)),
  fixture_conversations(id,artist_id) AS (VALUES ('${a}'::uuid,'${a}'::uuid),('${b}'::uuid,'${b}'::uuid)),
  fixture_messages(id,conversation_id,sender,created_at) AS (VALUES
    (1,'${a}'::uuid,'client','2026-10-01T10:00:00Z'::timestamptz),
    (2,'${a}'::uuid,'client','2026-11-01T10:00:00Z'::timestamptz),
    (3,'${b}'::uuid,'client','2026-11-02T10:00:00Z'::timestamptz),
    (4,'${b}'::uuid,'client','2026-11-03T10:00:00Z'::timestamptz),
    (5,'${a}'::uuid,'ai','2026-11-03T10:00:00Z'::timestamptz),
    (6,'${b}'::uuid,'ai','2026-11-03T10:00:00Z'::timestamptz),
    (7,'${a}'::uuid,'artist','2026-11-03T10:00:00Z'::timestamptz),
    (8,'${a}'::uuid,'system','2026-11-03T10:00:00Z'::timestamptz)),
  fixture_bookings(id,artist_id,is_seed,status,created_at,completed_at,amount,total,paid_amount,invoice_no) AS (VALUES
    (1,'${a}'::uuid,false,'completed','2026-11-01T10:00:00Z'::timestamptz,'2026-11-10T10:00:00Z'::timestamptz,100::numeric,105::numeric,105::numeric,'INV-1'),
    (2,'${a}'::uuid,false,'confirmed','2026-11-02T10:00:00Z'::timestamptz,null,200,210,0,'INV-2'),
    (3,'${b}'::uuid,false,'completed','2026-09-01T10:00:00Z'::timestamptz,'2026-11-14T21:00:00Z'::timestamptz,300,315,315,null)),
  fixture_service_invoices(id,artist_id,created_at,booking_id,conversation_id,status) AS (VALUES
    (10,'${a}'::uuid,'2026-11-02T10:00:00Z'::timestamptz,2,'${a}'::uuid,'unpaid'),
    (11,'${a}'::uuid,'2026-11-03T10:00:00Z'::timestamptz,null,null,'unpaid')),
  fixture_reviews(artist_id,rating,status) AS (VALUES ('${a}'::uuid,5::numeric,'published'))
`;
let aggregate = migration.slice(start, end).replace(/^WITH /, ", ");
for (const table of ["artists", "conversations", "messages", "bookings", "service_invoices", "reviews"]) aggregate = aggregate.replaceAll(`public.${table}`, `fixture_${table}`);
aggregate = aggregate.replaceAll("first_day", "DATE '2026-10-26'").replaceAll("last_day", "DATE '2026-11-24'").replaceAll("_artist_id", "NULL::uuid").replaceAll("_days", "30").replaceAll("_page", "0");
const output = execFileSync("lovable", ["supabase", "query", fixtures + aggregate, "--json"], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
const parsed = JSON.parse(output);
function findReport(value) {
  if (!value || typeof value !== "object") return null;
  if (value.summary && value.statistics && value.daily) return value;
  for (const item of Object.values(value)) { const found = findReport(item); if (found) return found; }
  return null;
}
const report = findReport(parsed);
assert.ok(report, "Read-only SQL must return a report");
assert.equal(report.statistics.incoming, 3, "Incoming counts only client messages in the period");
assert.equal(report.statistics.clientReply, 2, "Client replies exclude first messages, including older chats");
assert.equal(report.statistics.aiReply, 2, "System messages must not count as AI replies");
assert.equal(report.statistics.artistReply, 1, "Artist replies use the stored artist sender");
assert.equal(report.statistics.invoiceSent, 2, "Linked invoices count once; undelivered drafts do not count");
assert.equal(report.statistics.unpaidInvoice, 1, "A paid linked booking cannot be counted unpaid");
assert.equal(report.summary.completedJobs, 2, "Completion uses completion date, not creation or payment date");
assert.equal(report.daily.find(day => day.date === "2026-11-15")?.total, 1, "Completion dates must use Dubai time");
assert.equal(report.daily.reduce((total, day) => total + day.total, 0), 2, "Daily jobs must reconcile with completed total");
assert.equal(report.summary.completionRate, 50, "Completion rate is for the created-booking cohort");
assert.equal(report.summary.averageBookingValue, 150, "Booking value excludes VAT");
assert.equal(report.summary.aiShare, 66.7, "AI share excludes clients and system messages");
console.log("12 read-only analytics assertions passed; no application data changed.");