import type { QueryClient } from "@tanstack/react-query";

// Invalidation is local to this browser; mounted libraries refetch across sessions.
export const libraryRefresh = { staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true } as const;
const prefixes = new Set([
  "admin-library-counts", "admin-library-usage", "admin-library-audit", "admin-prompts",
  "admin-form-templates", "admin-contract-templates", "admin-flow-templates", "admin-model-rates",
  "flow-templates", "form-templates", "contract-templates", "agent-prompts", "library-updates",
]);
export function invalidateLibraries(client: QueryClient) {
  return client.invalidateQueries({ predicate: (query) => prefixes.has(String(query.queryKey[0])) });
}