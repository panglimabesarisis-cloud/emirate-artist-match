import { z } from "zod";

export const openJobSchema = z.object({
  title: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(1).max(4000),
  preferences: z.string().trim().max(500).default(""),
  categoryId: z.string().uuid().nullable().default(null),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  venue: z.string().trim().min(1).max(500),
  budgetAED: z.number().finite().positive().max(10_000_000),
});
export const applicationSchema = z.object({ jobId: z.string().uuid(), artistId: z.string().uuid(), message: z.string().trim().max(1000), proposedAED: z.number().finite().positive().max(10_000_000).nullable() });
export type OpenJobInput = z.input<typeof openJobSchema>;
export const JOB_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const JOB_DOC_MAX_BYTES = 5 * 1024 * 1024;
export function validateJobDocument(bytes: Uint8Array, mime: string) {
  if (bytes.length < 4 || bytes.length > JOB_DOC_MAX_BYTES) throw new Error("Maximum document size is 5 MB");
  const valid = mime === "application/pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
    : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : false;
  if (!valid) throw new Error("Upload a valid PDF, JPG or PNG document");
}