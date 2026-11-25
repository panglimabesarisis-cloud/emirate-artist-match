/** Creates an invoice for a client chat and posts it into that chat. The caller must already have checked that the artist owns the chat. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildInvoice, encodeInvoice } from "./invoice";
import { maskContacts } from "./masking";
import { newInvoiceNumber } from "./invoice-number.server";

export async function postInvoice(input: { artistId: string; conversationId: string; items: { title: string; qty: number; price: number }[]; due: string | null; notes: string | null }) {
  const no = await newInvoiceNumber();
  const inv = buildInvoice(no, input.items.map((x) => ({ ...x, title: maskContacts(x.title) })), input.due, input.notes ? maskContacts(input.notes) : null);
  inv.id = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("service_invoices").insert({ id: inv.id, artist_id: input.artistId, conversation_id: input.conversationId, number: no, document: JSON.parse(JSON.stringify(inv)), total: inv.total });
  if (error) throw new Error(error.message);
  const { addMessage } = await import("./agent.server");
  await addMessage(input.conversationId, "artist", encodeInvoice(inv));
  return { no, total: inv.total, id: inv.id };
}
