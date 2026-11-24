/** Integer micro-USD final task price; provider cost stays internal. */
export function finalAgentTaskCost(costUsdMicros: number | null): number | null {
  if (costUsdMicros === null || !Number.isSafeInteger(costUsdMicros) || costUsdMicros < 0) return null;
  return Math.ceil(costUsdMicros * 140 / 100);
}
export function agentTaskCredits(costUsdMicros: number | null): number | null {
  const final = finalAgentTaskCost(costUsdMicros);
  return final === null ? null : Math.ceil(final * 3.6725 / 0.49) / 1000000;
}

/** Standard tariffs apply only below the provider's 272K per-request threshold.
 * UTF-8 bytes plus a 32K multimodal/framing margin conservatively bound these calls.
 * Never silently truncate the user's task or bill long-context tokens at short rates.
 */
export function assertAgentTaskContext(input: unknown, instructions: string, tools: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify({ input, instructions, tools })).length;
  if (bytes > 240000) throw new Error("This task is too large. Start a new chat or attach a smaller file.");
}