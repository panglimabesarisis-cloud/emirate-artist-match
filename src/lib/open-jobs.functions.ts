import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicationSchema, JOB_DOC_MAX_BYTES, JOB_DOC_TYPES, openJobSchema, validateJobDocument } from "./open-job-rules";
import { CHAT_BUCKET } from "./chat-attachments";
import { maskContacts } from "./masking";

export const postOpenJob = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => openJobSchema.parse(v)).handler(async ({ data, context }) => {
  if (data.submissionId) {
    const { data: existing } = await context.supabase.from("open_jobs").select("id").eq("id", data.submissionId).eq("client_user_id", context.userId).maybeSingle();
    if (existing) return existing;
  }
  const { data: job, error } = await context.supabase.from("open_jobs").insert({
    ...(data.submissionId ? { id: data.submissionId } : {}),
    client_user_id: context.userId, title: maskContacts(data.title), brief: maskContacts(data.brief), preferences: maskContacts(data.preferences), category_id: data.categoryId,
    event_date: data.eventDate, start_time: data.startTime, end_time: data.endTime, venue: maskContacts(data.venue), budget_aed: data.budgetAED,
  }).select("id").single();
  if (error?.code === "23505" && data.submissionId) {
    const { data: existing } = await context.supabase.from("open_jobs").select("id").eq("id", data.submissionId).eq("client_user_id", context.userId).maybeSingle();
    if (existing) return existing;
  }
  if (error || !job) throw new Error("Could not post inquiry. Check that the event date is not in the past.");
  return job;
});

export const applyOpenJob = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => applicationSchema.parse(v)).handler(async ({ data, context }) => {
  const { data: artist } = await context.supabase.from("artists").select("id").eq("id", data.artistId).eq("user_id", context.userId).eq("status", "approved").maybeSingle();
  if (!artist) throw new Error("Only an approved artist owner can apply");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: id, error } = await supabaseAdmin.rpc("apply_open_job", { _actor: context.userId, _job: data.jobId, _artist: artist.id, _message: maskContacts(data.message), ...(data.proposedAED === null ? {} : { _proposed: data.proposedAED }) });
  if (error || !id) throw new Error("This inquiry is no longer available");
  return { id };
});

export const decideJobApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.object({ applicationId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(v)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("job_applications").select("id, job_id").eq("id", data.applicationId).maybeSingle();
  if (!app) throw new Error("Application unavailable");
  const { data: job } = await context.supabase.from("open_jobs").select("*").eq("id", app.job_id).eq("client_user_id", context.userId).maybeSingle();
  if (!job) throw new Error("Only the inquiry owner can decide");
  const { data: profile } = await context.supabase.from("profiles").select("display_name").eq("id", context.userId).maybeSingle();
  const email = typeof context.claims.email === "string" ? context.claims.email : "";
  if (!email) throw new Error("A verified account email is required");
  const summary = maskContacts([`Open inquiry: ${job.title}`, `Brief: ${job.brief}`, `Preferences: ${job.preferences}`, `Event: ${job.event_date}, ${job.start_time} to ${job.end_time}`, `Venue: ${job.venue}`, `Budget: AED ${job.budget_aed}`, "Client approved this application for negotiation only, not a booking or a price."].join("\n"));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: result, error } = await supabaseAdmin.rpc("decide_job_application", { _actor: context.userId, _application: app.id, _decision: data.decision, _name: maskContacts(profile?.display_name || "Client"), _email: email, _summary: summary });
  if (error) throw new Error("This application cannot be changed");
  return z.object({ conversationId: z.string().uuid().optional(), key: z.string().uuid().optional() }).parse(result);
});

export const withdrawJobApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.object({ applicationId: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("job_applications").select("artist_id").eq("id", data.applicationId).maybeSingle();
  if (!app) throw new Error("Application unavailable");
  const { data: artist } = await context.supabase.from("artists").select("id").eq("id", app.artist_id).eq("user_id", context.userId).maybeSingle();
  if (!artist) throw new Error("Only the artist owner can withdraw");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("withdraw_job_application", { _actor: context.userId, _application: data.applicationId });
  if (error) throw new Error("Only pending applications can be withdrawn");
  return { ok: true };
});

export const uploadJobDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.object({ documentId: z.string().uuid().optional(), jobId: z.string().uuid(), name: z.string().min(1).max(120), mime: z.enum(JOB_DOC_TYPES), base64: z.string().max(Math.ceil(JOB_DOC_MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).parse(v)).handler(async ({ data, context }) => {
  const { data: job } = await context.supabase.from("open_jobs").select("id").eq("id", data.jobId).eq("client_user_id", context.userId).maybeSingle();
  if (!job) throw new Error("Only the inquiry owner can upload documents");
  if (data.documentId) {
    const { data: existing } = await context.supabase.from("job_documents").select("id").eq("id", data.documentId).eq("job_id", job.id).maybeSingle();
    if (existing) return { ok: true };
  }
  const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
  validateJobDocument(bytes, data.mime);
  const ext = data.mime === "application/pdf" ? "pdf" : data.mime === "image/png" ? "png" : "jpg";
  const documentId = data.documentId ?? crypto.randomUUID();
  const path = `inquiries/${job.id}/${documentId}.${ext}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: uploadError } = await supabaseAdmin.storage.from(CHAT_BUCKET).upload(path, bytes, { contentType: data.mime, upsert: true });
  if (uploadError) throw new Error("Document upload failed");
  const { error } = await supabaseAdmin.from("job_documents").upsert({ id: documentId, job_id: job.id, path, name: maskContacts(data.name), mime_type: data.mime, size_bytes: bytes.length }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("The upload could not be linked to your inquiry");
  return { ok: true };
});

export const openJobDocument = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
  const { data: file } = await context.supabase.from("job_documents").select("path").eq("id", data.id).maybeSingle();
  if (!file) throw new Error("Document access requires client approval");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: signed, error } = await supabaseAdmin.storage.from(CHAT_BUCKET).createSignedUrl(file.path, 300);
  if (error || !signed) throw new Error("Could not open document");
  return { url: signed.signedUrl };
});