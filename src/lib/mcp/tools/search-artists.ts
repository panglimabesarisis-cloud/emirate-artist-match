import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_artists",
  title: "Search artists",
  description: "Search approved Dealmaker talent by name, category slug or emirate slug, Artist rates are not public; they are given in the booking chat and on invoices.",
  inputSchema: {
    query: z.string().max(100).optional().describe("Part of the stage name, e.g. 'falcon'."),
    category: z.string().max(60).optional().describe("Category slug, e.g. 'djs', 'musicians'."),
    emirate: z.string().max(60).optional().describe("Emirate slug, e.g. 'dubai'."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ query, category, emirate, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("artists")
      .select("slug, stage_name, tagline, categories!inner(slug, name), emirates!inner(slug, name)")
      .eq("status", "approved")
      .limit(limit ?? 20);
    if (query) q = q.ilike("stage_name", `%${query.replace(/[%_]/g, "")}%`);
    if (category) q = q.eq("categories.slug", category);
    if (emirate) q = q.eq("emirates.slug", emirate);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const artists = (data ?? []).map((a) => ({
      slug: a.slug, name: a.stage_name, tagline: a.tagline ?? "",
      category: a.categories?.name ?? "", emirate: a.emirates?.name ?? "",
    }));
    return { content: [{ type: "text", text: JSON.stringify(artists) }], structuredContent: { artists } };
  },
});
