import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_quote_requests",
  title: "List quote requests",
  description: "List booking requests the signed-in user sent, or received for artists they own or work for.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("quote_requests")
      .select("id, name, event_date, start_time, end_time, guests, budget, status, created_at, artists(stage_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new ToolError(error.message);
    const requests = (data ?? []).map((r) => ({
      id: r.id, artist: r.artists?.stage_name ?? "", client: r.name, event_date: r.event_date ?? "",
      time: r.start_time ? `${r.start_time.slice(0, 5)}-${(r.end_time ?? "").slice(0, 5)}` : "",
      guests: r.guests, budget_aed: r.budget === null ? null : Number(r.budget), status: r.status, created_at: r.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(requests) }], structuredContent: { requests } };
  },
});
