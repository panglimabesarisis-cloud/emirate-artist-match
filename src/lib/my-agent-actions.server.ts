/** Runs a confirmed proposal of the private AI agent (everything except Google Calendar events). Server only. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { youtubeId } from "./media";
import { postInvoice } from "./invoice-send.server";
import type { AgentProposal } from "./my-agent-proposals";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function runConfirmedProposal(proposal: AgentProposal, who: { artistId: string; userId: string }): Promise<Record<string, unknown>> {
  const { artistId, userId } = who;
  const db = supabaseAdmin;
  switch (proposal.kind) {
    case "schedule_item": {
      const p = proposal.payload;
      const { data, error } = await db.from("schedule_items").insert({ artist_id: artistId, title: p.title, event_date: p.date, start_time: p.startTime, end_time: p.endTime, notes: p.notes, source: "ai", created_by: userId }).select("id").single();
      if (error) throw new Error("The schedule entry could not be saved.");
      return { id: data.id, title: p.title, date: p.date };
    }
    case "rate_card": {
      const p = proposal.payload;
      const { count } = await db.from("rate_cards").select("id", { count: "exact", head: true }).eq("artist_id", artistId);
      const { data, error } = await db.from("rate_cards").insert({ artist_id: artistId, title: p.title, price: p.price, duration_minutes: p.minutes, description: p.description, sort: (count ?? 0) + 1 }).select("id").single();
      if (error) throw new Error("The rate card could not be saved.");
      return { id: data.id, title: p.title };
    }
    case "media_youtube": {
      const id = youtubeId(proposal.payload.url);
      if (!id) throw new Error("That is not a YouTube link.");
      const { count } = await db.from("artist_media").select("id", { count: "exact", head: true }).eq("artist_id", artistId);
      const { error } = await db.from("artist_media").insert({ artist_id: artistId, kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, sort: (count ?? 0) + 1 });
      if (error) throw new Error("The video could not be added.");
      return { videoId: id };
    }
    case "media_photo": {
      const { data: file } = await db.from("agent_chat_files").select("storage_path, name, mime, bytes").eq("id", proposal.payload.fileId).eq("artist_id", artistId).maybeSingle();
      if (!file || !file.mime.startsWith("image/")) throw new Error("The attached image is no longer available.");
      if (Number(file.bytes) > MAX_PHOTO_BYTES) throw new Error("The image is larger than 10 MB.");
      const blob = await db.storage.from("agent-chat").download(file.storage_path);
      if (blob.error || !blob.data) throw new Error("The attached image could not be read.");
      const path = `${artistId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await db.storage.from("artist-media").upload(path, blob.data, { contentType: file.mime });
      if (up.error) throw new Error("The photo could not be uploaded.");
      const { count } = await db.from("artist_media").select("id", { count: "exact", head: true }).eq("artist_id", artistId);
      const saved = await db.from("artist_media").insert({ artist_id: artistId, kind: "photo", url: path, storage_path: path, sort: (count ?? 0) + 1 });
      if (saved.error) { await db.storage.from("artist-media").remove([path]); throw new Error("The photo could not be added."); }
      return { name: file.name };
    }
    case "send_invoice": {
      const p = proposal.payload;
      const { data: convo } = await db.from("conversations").select("id, artist_id").eq("id", p.conversationId).maybeSingle();
      if (!convo || convo.artist_id !== artistId) throw new Error("That chat is not in your inbox.");
      const sent = await postInvoice({ artistId, conversationId: p.conversationId, items: p.items, due: p.due, notes: p.notes });
      return { number: sent.no, total: sent.total };
    }
    default:
      throw new Error("Unsupported action");
  }
}
