/** Integer micro-USD final task price; provider cost stays internal. */
export function finalAgentTaskCost(costUsdMicros: number | null): number | null {
  if (costUsdMicros === null || !Number.isSafeInteger(costUsdMicros) || costUsdMicros < 0) return null;
  return Math.ceil(costUsdMicros * 140 / 100);
}
export function agentTaskCredits(costUsdMicros: number | null): number | null {
  const final = finalAgentTaskCost(costUsdMicros);
  return final === null ? null : Math.ceil(final * 3.6725 / 0.49) / 1000000;
}