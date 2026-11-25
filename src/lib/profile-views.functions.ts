import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/** Counts a visit to a public artist profile. A failure never disturbs the page. */
export const recordProfileView = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    try {
      const headers = getRequest().headers;
      const ip = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      const { saveProfileView } = await import("./profile-views.server");
      await saveProfileView(data.slug, { ip, agent: headers.get("user-agent") ?? "" });
    } catch (error) { console.error("profile view not recorded", error instanceof Error ? error.message : error); }
    return { ok: true };
  });
