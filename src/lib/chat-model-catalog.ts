/** Verified workspace Responses models; non-chat media models are deliberately excluded. */
export const CHAT_MODEL_CATALOG = [
  {"id": "openai/chat-latest", "name": "ChatGPT Latest", "tier": "balanced"},
  {"id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "advanced"},
  {"id": "openai/gpt-5.4-mini", "name": "GPT-5.4 Mini", "tier": "fast"},
  {"id": "openai/gpt-5.5", "name": "GPT-5.5", "tier": "advanced"},
  {"id": "openai/gpt-5.6-luna", "name": "GPT-5.6 Luna", "tier": "balanced"},
  {"id": "openai/gpt-5.6-sol", "name": "GPT-5.6 Sol", "tier": "advanced"},
  {"id": "openai/gpt-5.6-terra", "name": "GPT-5.6 Terra", "tier": "advanced"},
  {"id": "openai/gpt-6-astra", "name": "GPT-6 Astra", "tier": "advanced"},
] as const;
export type CatalogModel = typeof CHAT_MODEL_CATALOG[number]["id"];
export function catalogModel(value: string | null | undefined) { return CHAT_MODEL_CATALOG.find(model => model.id === value); }
