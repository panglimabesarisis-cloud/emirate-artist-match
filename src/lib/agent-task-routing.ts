/** Server-selected capability, never an authorization or pricing decision. */
export const TASK_MODELS = {
  fast: "openai/gpt-5.4-mini",
  balanced: "openai/gpt-5.6-luna",
  advanced: "openai/gpt-6-astra",
} as const;

type TaskContext = {
  text: string;
  privateAgent: boolean;
  hasAttachments?: boolean;
  hasPendingActions?: boolean;
  bookingInProgress?: boolean;
};

export function agentTaskTier(task: TaskContext): keyof typeof TASK_MODELS {
  const text = task.text.trim().toLowerCase();
  if (task.privateAgent && (task.hasAttachments || task.hasPendingActions ||
    /\b(invoice|contract|report|analytic\w*|table|chart|draft|create|prepare|schedule|calendar|performance|earnings|revenue)\b|buat\w*|laporan|jadwal|kontrak|tabel|grafik|analisis|فاتورة|عقد|تقرير|جدول/.test(text))) return "advanced";
  if (/^(hi|hello|hey|thanks|thank you|halo|hai|terima kasih|مرحبا|شكرا)[\s!.?]*$/.test(text)) return "fast";
  if (!task.bookingInProgress && /^(are you (an? )?ai|what is dealmaker|how does (this|dealmaker) work|apakah (kamu|anda) ai)[\s!.?]*$/.test(text)) return "fast";
  if (!task.privateAgent || task.bookingInProgress ||
    /\b(book\w*|price|rate\w*|package|availability|available|calendar|schedule|discount|budget)\b|harga|paket|jadwal|خصم|حجز|سعر/.test(text)) return "balanced";
  // Private account questions may require tools even without an explicit action verb.
  return "advanced";
}

export function agentTaskModel(task: TaskContext) {
  return TASK_MODELS[agentTaskTier(task)];
}

export type AgentTier = keyof typeof TASK_MODELS;
/** The model card the artist saved. Null and legacy model ids mean automatic routing. */
export function chosenTier(choice: string | null | undefined): AgentTier | null {
  return choice === "fast" || choice === "balanced" || choice === "advanced" ? choice : null;
}

/** Public booking and test chats: the artist's card wins, otherwise the task decides. */
export function artistAgentModel(choice: string | null | undefined, task: TaskContext) {
  const tier = chosenTier(choice);
  return tier ? TASK_MODELS[tier] : agentTaskModel(task);
}
