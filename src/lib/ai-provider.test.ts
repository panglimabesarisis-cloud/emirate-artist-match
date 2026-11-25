import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), fetch: vi.fn(), secrets: [] as { key: string; value: string }[] }));

vi.mock("@lovable.dev/ai-gateway", () => ({
  generateResponse: mocks.generate,
  GatewayError: class GatewayError extends Error { constructor(public code: string, public outcome: string) { super(code); } },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ in: async () => ({ data: mocks.secrets, error: null }) }) }) } }));

import { GatewayError } from "@lovable.dev/ai-gateway";
import { aiResponse, readGoogleBackup } from "./ai-provider.server";

const Refusal = GatewayError as unknown as new (code: string, outcome: string) => Error;
const reply = (message: unknown, extra: object = {}) => new Response(JSON.stringify({ id: "g1", choices: [{ finish_reason: "stop", message }], usage: { prompt_tokens: 900, completion_tokens: 2500, prompt_tokens_details: { cached_tokens: 100 } }, ...extra }));
const sent = (call = 0) => JSON.parse((mocks.fetch.mock.calls[call]![1] as { body: string }).body);
const tool = { type: "function", name: "check_calendar", description: "Check", strict: true, parameters: { type: "object", properties: {} } };
const request = { model: "openai/gpt-6-astra", instructions: "Be brief.", input: [{ role: "user", content: "Free on Friday?" }], tools: [tool], max_output_tokens: 600 } as never;

beforeAll(() => vi.stubGlobal("fetch", mocks.fetch));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { vi.clearAllMocks(); mocks.secrets = [{ key: "google_api_key", value: "test-google-key" }]; });

describe("AI backup", () => {
  it("uses the built-in AI while it works", async () => {
    mocks.generate.mockResolvedValue({ output: [] });
    await aiResponse(request);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("answers through Google when credits are used up, in the same shape", async () => {
    mocks.generate.mockRejectedValue(new Refusal("payment_required", "not_started"));
    mocks.fetch.mockResolvedValue(reply({ content: "Yes, Friday is open." }));
    const result = await aiResponse(request);
    expect(result.output).toEqual([{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Yes, Friday is open." }] }]);
    // The artist is never charged for more output than the 600 allowed.
    expect(result.usage).toMatchObject({ input_tokens: 900, output_tokens: 600, input_tokens_details: { cached_tokens: 100 } });
    const [url, init] = mocks.fetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(init.headers["Authorization"]).toBe("Bearer test-google-key");
    // The published server runs at the edge, which rejects redirect: "error" before sending anything.
    expect((init as { redirect?: string }).redirect).toBe("manual");
    expect(sent()).toMatchObject({ model: "gemini-3.8-flash", messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "Free on Friday?" }], tools: [{ type: "function", function: { name: "check_calendar" } }] });
    expect(JSON.stringify(sent())).not.toContain("strict");
  });

  it("carries a tool call and its signature back with the result", async () => {
    mocks.generate.mockRejectedValue(new Refusal("payment_required", "not_started"));
    mocks.fetch.mockResolvedValueOnce(reply({ content: null, tool_calls: [{ id: "c1", function: { name: "check_calendar", arguments: "{}" }, extra_content: { google: { thought_signature: "sig" } } }] }));
    const first = await aiResponse(request);
    expect(first.output).toEqual([{ type: "function_call", name: "check_calendar", call_id: "c1", arguments: "{}" }]);
    mocks.fetch.mockResolvedValueOnce(reply({ content: "Open." }));
    await aiResponse({ model: "m", input: [{ type: "function_call", name: "check_calendar", call_id: "c1", arguments: "{}" }, { type: "function_call_output", call_id: "c1", output: "{\"free\":true}" }, { type: "function_call", name: "check_calendar", call_id: "other", arguments: "{}" }], tools: [tool], tool_choice: "none" } as never);
    const body = sent(1);
    expect(body.messages[0].tool_calls[0].extra_content).toEqual({ google: { thought_signature: "sig" } });
    expect(body.messages[1]).toEqual({ role: "tool", tool_call_id: "c1", content: "{\"free\":true}" });
    expect(body.messages[2].tool_calls[0].extra_content.google.thought_signature).toBe("skip_thought_signature_validator");
    expect(body.tool_choice).toBe("none");
  });

  it("asks for the same JSON shape and handles images and files", async () => {
    mocks.generate.mockRejectedValue(new Refusal("gateway_unavailable", "not_started"));
    mocks.fetch.mockResolvedValue(reply({ content: "{}" }));
    await aiResponse({ model: "m", input: [{ role: "user", content: [{ type: "input_text", text: "See" }, { type: "input_image", image_url: "data:image/png;base64,AA" }, { type: "input_file", filename: "a.pdf", file_data: "data:application/pdf;base64,AA" }] }], text: { format: { type: "json_schema", name: "n", strict: true, schema: { type: "object" } } } } as never);
    expect(sent().response_format).toEqual({ type: "json_schema", json_schema: { name: "n", schema: { type: "object" } } });
    expect(sent().messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AA" } });
    expect(sent().messages[0].content[2].text).toContain("a.pdf");
    expect(JSON.stringify(sent())).not.toContain("application/pdf");
  });

  it("never repeats a request whose outcome is unclear", async () => {
    const unclear = new Refusal("gateway_timeout", "unknown");
    mocks.generate.mockRejectedValue(unclear);
    await expect(aiResponse(request)).rejects.toBe(unclear);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps the original refusal when there is no key or Google also fails", async () => {
    const refusal = new Refusal("payment_required", "not_started");
    mocks.generate.mockRejectedValue(refusal);
    mocks.secrets = [];
    await expect(aiResponse(request)).rejects.toBe(refusal);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.secrets = [{ key: "google_api_key", value: "k" }];
    mocks.fetch.mockResolvedValue(new Response("no", { status: 429 }));
    await expect(aiResponse(request)).rejects.toBe(refusal);
  });

  it("accepts a model written with or without its prefix", async () => {
    mocks.secrets = [{ key: "google_api_key", value: "k" }, { key: "google_model", value: "google/gemini-3.6-flash" }];
    expect(await readGoogleBackup()).toEqual({ key: "k", model: "gemini-3.6-flash" });
    mocks.secrets = [{ key: "google_api_key", value: "k" }, { key: "google_model", value: "bad model\n" }];
    expect((await readGoogleBackup())!.model).toBe("gemini-3.8-flash");
  });
});
