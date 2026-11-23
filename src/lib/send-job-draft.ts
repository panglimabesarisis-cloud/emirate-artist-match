import { openJobSchema, type OpenJobInput } from "./open-job-rules";

export type JobFields = { title: string; categoryId: string; preferences: string; eventDate: string; startTime: string; endTime: string; venue: string; eventType: string; brief: string; budget: string };
export type DraftDocument = { id: string; name: string; mime: "application/pdf" | "image/jpeg" | "image/png"; blob: Blob; uploaded: boolean };
export type JobDraft = { id: string; fields: JobFields; documents: DraftDocument[]; pending: boolean; ownerId: string | null; step: number };
export const emptyJobFields: JobFields = { title: "", categoryId: "", preferences: "", eventDate: "", startTime: "", endTime: "", venue: "", eventType: "", brief: "", budget: "" };

export function jobDraftInput(draft: JobDraft): OpenJobInput {
  return openJobSchema.parse({ submissionId: draft.id, title: draft.fields.title, categoryId: draft.fields.categoryId || null, preferences: draft.fields.preferences,
    eventDate: draft.fields.eventDate, startTime: draft.fields.startTime, endTime: draft.fields.endTime, venue: draft.fields.venue,
    brief: [draft.fields.eventType ? `Event type: ${draft.fields.eventType}` : "", draft.fields.brief].filter(Boolean).join("\n\n"), budgetAED: Number(draft.fields.budget) });
}

// IndexedDB stores attachment bytes as well as text through full-page OAuth redirects.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dealmaker-send-job", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not save your draft on this device"));
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = action(tx.objectStore("drafts"));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(new Error("Could not save your draft on this device")); };
    tx.onabort = () => { db.close(); reject(new Error("Could not save your draft on this device")); };
  });
}
export async function readJobDraft(): Promise<JobDraft | null> {
  const draft: unknown = await transact("readonly", store => store.get("current"));
  if (!draft || typeof draft !== "object" || !("id" in draft) || !("fields" in draft) || !("documents" in draft)) return null;
  return draft as JobDraft;
}
export async function saveJobDraft(draft: JobDraft) { await transact("readwrite", store => store.put(draft, "current")); }
export async function clearJobDraft() { await transact("readwrite", store => store.delete("current")); }