# Invoice archive: database and Drive handoff

## Migration and permissions

- Applied `drizzle/migrations/0056_invoice_drive_archive_queue.sql`; generated application types refreshed.
- `invoice_archive_jobs`: unique `(invoice_id, kind)` issued/paid jobs, completion metadata, retry timing, locks and timestamps.
- `drive_folders`: unique folder key and stored Drive ID.
- Both tables: admin SELECT only; service role full access; no anonymous or ordinary authenticated access.
- `claim_invoice_archive_jobs(_limit int DEFAULT 10)` is service-role-only. Due pending jobs and running jobs locked **more than 10 minutes** ago are claimed oldest first with `FOR UPDATE SKIP LOCKED`, incrementing attempts. Failed jobs need an explicit worker retry decision. Null/nonpositive limits are rejected.
- Issuance and paid-status-transition triggers catch enqueue failures, emit only a SQLSTATE warning, and do not abort invoice transactions. Worker recovery/reconciliation should account for missing jobs after an enqueue failure.
- Backfill verified: **10 issued jobs, 1 paid job**, all pending; no deleted/hidden filtering.
- Existing expiry function and invoice policies were not changed. Its conservative dependency check now skips permanent purge of an invoice that has archive jobs; the invoice stays hidden. This is verified in tests, not a change to the expiry implementation.
- Forward INSERT creates an issued job; a transition from non-paid to paid creates the paid job. Already-paid rows were covered by backfill.

## Verified Google Drive connection

- Connection display name: **Dealmaker File** (linked to the app).
- Gateway origin/base: `https://connector-gateway.lovable.dev/google_drive`
- Drive v3 base: `https://connector-gateway.lovable.dev/google_drive/drive/v3`
- Upload base: `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3`
- Environment/secret names: **`LOVABLE_API_KEY`**, **`GOOGLE_DRIVE_API_KEY`**.
- Required gateway headers:
  - `Authorization: Bearer ${LOVABLE_API_KEY}`
  - `X-Connection-Api-Key: ${GOOGLE_DRIVE_API_KEY}`
- JSON folder creation: `Content-Type: application/json`.
- PDF upload: `Content-Type: multipart/related; boundary=<boundary>`; first part JSON metadata, second part `application/pdf` bytes. Do not use multipart/form-data.
- Configured/granted OAuth scopes reported by the connection:
  - `https://www.googleapis.com/auth/drive.file`
  - `https://www.googleapis.com/auth/drive.appdata`
  - `https://www.googleapis.com/auth/drive.readonly`

### Paths exercised successfully

| Method | Gateway path (after `/google_drive`) | Parameters / result |
| --- | --- | --- |
| GET | `/drive/v3/files/1gmYp4rjVfw6aSSJvTkc1uoP_an88NuSh` | `fields=id,name,mimeType,capabilities(canAddChildren,canDelete)&supportsAllDrives=true`; HTTP 200, folder `Invoice`, canAddChildren true |
| POST | `/drive/v3/files` | JSON name `DEALMAKER-CONNECTION-TEST`, MIME `application/vnd.google-apps.folder`, parents containing root ID; `fields=id,name,parents,mimeType&supportsAllDrives=true`; HTTP 200 |
| POST | `/upload/drive/v3/files` | `uploadType=multipart&fields=id,name,mimeType,size,parents&supportsAllDrives=true`; multipart/related PDF + metadata with test subfolder parent; HTTP 200 |
| DELETE | `/drive/v3/files/{testPdfId}` | `supportsAllDrives=true`; HTTP 204 |
| DELETE | `/drive/v3/files/{testFolderId}` | `supportsAllDrives=true`; HTTP 204 |
| GET | `/drive/v3/files` | Root-parent/name query, `fields=files(id,name,trashed)`; HTTP 200, empty files after cleanup |

The app's own environment credential path also returned HTTP 200 for the root folder and multipart upload. The temporary PDF and folder were both permanently deleted. A GET for the deleted PDF returned the expected HTTP 404 `File not found`. No connector operation failed and no scope change is required for these tested operations. Broader editing of pre-existing Drive files was not tested or claimed.

## Root setting and worker requirements

- Admin-only `admin_secrets` key: **`invoice_archive_root_folder_id`**. Stored root ID: `1gmYp4rjVfw6aSSJvTkc1uoP_an88NuSh`.
- Server/job code, after verifying its caller, should dynamically load the generated privileged client and read `admin_secrets.value` for this key:

```ts
const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
const { data, error } = await supabaseAdmin
  .from('admin_secrets')
  .select('value')
  .eq('key', 'invoice_archive_root_folder_id')
  .single();
if (error || !data?.value) throw new Error('Invoice archive root folder is not configured');
const rootFolderId = data.value;
```

Do not expose admin settings or connection credentials in browser code or logs. Fetch invoices through the authorized privileged job path so deleted/hidden rows remain archivable.

The folder registry primary key prevents duplicate **registry rows**, not duplicate remote API calls. The worker must serialize lookup/create/store per key (for example a database transaction/advisory lock held across creation). Google Drive create/upload requests are not atomically coupled to database commits; crash-safe reconciliation and remote idempotency also belong to part 2. Persist file metadata and retry state after upload, and account for stale claims being reclaimed after ten minutes.

## Verification and remaining work

- `docs/database-tests/invoice-archive.sql`: isolated rollback-only assertions passed, including all-row backfill, enqueue fault injection, admin/service/anon permissions, duplicate protection, defaults, stale-lock timing, claim ordering and unchanged expiry behavior.
- Two simultaneous local test sessions claimed different jobs using SKIP LOCKED; both claims rolled back. Concurrent registry inserts retained one key/Drive ID. The isolated database and test roles were removed.
- Existing invoice-visibility, conversation and schedule-item SQL regressions passed.
- No app code, PDF worker, job route, or cron was created. Automatic real-invoice PDF archiving awaits part 2; only the temporary PDF upload was exercised.

## Part 2: managed schedule (2026-11-22)

- Created and re-listed active managed HTTP schedule **invoice-drive-archive**, job ID **4**, expression `*/5 * * * *`, POST target `/api/public/jobs/invoice-archive`, JSON body `{}`. It uses the same platform-managed authentication and production targeting as booking-reminders and payments; no credentials were copied or changed.
- Observed its actual automatic invocation at **09:30 UTC**: `POST https://project--89c85f90-b1b5-4df1-aefa-90971ead26d6.lovable.app/api/public/jobs/invoice-archive` returned **HTTP 404**, HTML rather than `{ "ok": true, ... }`. The network response record and published request log agree. The new route is present locally but absent from the published deployment; **publish the deployment containing the route and worker**, then verify a subsequent scheduled run. No publication was performed in this request.
- After that run: **10 issued/pending**, **1 paid/pending**, all attempts **0**, all `last_error` **NULL**. The folder registry is empty.
- Read-only Google Drive inspection using **Dealmaker File** returned HTTP 200 and an empty archive root: no Artist / Year / Month folders or PDFs yet. Nothing was deleted or modified in Drive.
- This is a deployment blocker, not an observed Drive permission failure or a worker job error; the worker did not execute, so no failing code line can be identified. Successful PDF generation/upload and the HTTP-200 result remain unverified.
- Cadence is 288 runs per day, with up to five minutes before the next attempt; idle checks can increase Cloud compute costs. Existing schedules and application code remain unchanged.