import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { agentTaskCredits } from "./agent-task-cost";
import { type Usage } from "./agent-options";

export class AgentPricingUnavailableError extends Error {
  constructor(message = "AI task pricing is not configured for this model. Contact the platform administrator.") {
    super(message);
    this.name = "AgentPricingUnavailableError";
  }
}

/** No guessed prices: active admin-owned provider rates are required before inference. */
export async function reserveAgentTask(artistId: string, ref: string, model: string, input: unknown, instructions: string, outputLimit: number) {
  const { data: rate, error } = await supabaseAdmin.from("ai_model_rates").select("*").eq("model", model).eq("is_active", true).maybeSingle();
  if (error) throw new AgentPricingUnavailableError("AI task pricing could not be loaded.");
  if (!rate) throw new AgentPricingUnavailableError();
  // Conservative byte/token ceiling over four rounds plus tool results; never use this estimate as the final charge.
  const bytes = new TextEncoder().encode(JSON.stringify(input) + instructions).length;
  const maxInput = (bytes + 24000 + outputLimit * 4) * 4;
  const maxCost = Math.ceil(maxInput * Number(rate.usd_in_per_mtok) + outputLimit * 4 * Number(rate.usd_out_per_mtok));
  const reserve = agentTaskCredits(maxCost);
  if (reserve === null || reserve <= 0) throw new AgentPricingUnavailableError("Invalid AI task pricing");
  const { data: taskId, error: taskError } = await supabaseAdmin.rpc("reserve_agent_task", { _artist: artistId, _ref: ref, _model: model, _reserve: reserve, _rate: rate });
  if (taskError || !taskId) throw new Error("Insufficient credits, or another AI task is still running. Try again after it finishes.");
  return { taskId, rate };
}

export async function settleAgentTask(taskId: string, usage: Usage, release = false) {
  if (!release && !usage.seen) throw new Error("Task usage is unavailable; reserved credits await review");
  const { data, error } = await supabaseAdmin.rpc("settle_agent_task", { _task: taskId, _in: usage.inTok, _cached: usage.cached, _out: usage.outTok, _release: release });
  if (error) throw new Error("AI task settlement needs administrator review");
  return data;
}