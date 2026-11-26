/** Pictures and videos the Personal AI Agent makes. */
export const MEDIA_TOOLS = [
  { name: "generate_image", description: "Create a picture (poster, design, illustration, photo-like scene) from a detailed description. It appears in the chat." },
  { name: "generate_video", description: "Create a short video clip from a detailed description. It takes a few minutes and then appears in the chat. Use only when the user asks for a video." },
].map((tool) => ({
  type: "function" as const, strict: true, ...tool,
  parameters: { type: "object", properties: { prompt: { type: "string", description: "Subject, style, mood, colours, text to show" }, aspect: { type: "string", enum: ["1:1", "16:9", "9:16"] } }, required: ["prompt", "aspect"], additionalProperties: false },
}));

export const VIDEO_JOB = /^models\/veo[\w.-]*\/operations\/[\w-]+$/;
export type ListedModel = { name: string; supportedGenerationMethods?: string[] };

/** The newest model for a kind of media; the cheaper "flash" or "fast" one of a version, released before preview. */
export function pickMediaModel(kind: "image" | "video", models: ListedModel[]): string | null {
  const method = kind === "image" ? "generateContent" : "predictLongRunning";
  const ranked = models.flatMap((m) => {
    const name = m.name.replace(/^models\//, "");
    const fits = kind === "image" ? /^gemini-[\d.]+.*image/.test(name) : /^veo-/.test(name);
    if (!fits || !m.supportedGenerationMethods?.includes(method)) return [];
    return [{ name, version: Number(/-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0), cheap: /flash|fast/.test(name), stable: !/preview|exp/.test(name) }];
  }).sort((a, b) => b.version - a.version || Number(b.cheap) - Number(a.cheap) || Number(b.stable) - Number(a.stable));
  return ranked[0]?.name ?? null;
}
