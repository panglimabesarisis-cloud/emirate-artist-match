import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_bookings",
  title: "List my bookings",
  description: "List bookings the signed-in user can see: as a client, or for artists they own or work for.",
  inputSchema: {
    status: z.enum(["inquiry", "quoted", "confirmed", "completed", "cancelled"]).optional().describe("Filter by booking status."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    let q = supabaseForUser(ctx)
      .from("bookings")
      .select("id, event_date, status, client_name, package_title, total, escrow_status, invoice_no, artists(stage_name)")
      .order("event_date", { ascending: false })
      .limit(100);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const bookings = (data ?? []).map((b) => ({
      id: b.id, artist: b.artists?.stage_name ?? "", client: b.client_name, event_date: b.event_date,
      status: b.status, package: b.package_title ?? "", total_aed: Number(b.total),
      escrow: b.escrow_status, invoice_no: b.invoice_no ?? "",
    }));
    return { content: [{ type: "text", text: JSON.stringify(bookings) }], structuredContent: { bookings } };
  },
});
