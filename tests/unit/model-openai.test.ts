import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTools } from "@/src/agent/tools";
import { OpenAIProvider, type ChatResponse } from "@/src/model/openai";
import { tool } from "@/src/model/types";

/** Scripted chat client: each call pops the next canned response and records what it was asked. */
function fakeClient(script: ChatResponse[]) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    chat: { completions: { create: async (params: Record<string, unknown>) => { calls.push(JSON.parse(JSON.stringify(params))); return script.shift() ?? { choices: [] }; } } },
  };
}

const assistant = (content: string | null, tool_calls?: ChatResponse["choices"][0]["message"]["tool_calls"], refusal?: string): ChatResponse => ({
  model: "gpt-5",
  choices: [{ message: { role: "assistant", content, tool_calls, refusal } }],
});

describe("OpenAIProvider.agentTurn", () => {
  it("runs a function call through the real tool, feeds the result back, returns the closing line", async () => {
    const seen: unknown[] = [];
    const echo = tool({
      name: "echo",
      description: "echo",
      inputSchema: z.object({ text: z.string(), times: z.number().int().default(1) }),
      run: async (input) => { seen.push(input); return `echoed ${input.text} x${input.times}`; },
    });
    const client = fakeClient([
      assistant(null, [{ id: "call_1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } }]),
      assistant("done."),
    ]);
    const provider = new OpenAIProvider(client, { big: "gpt-5", small: "gpt-5-mini" });
    const result = await provider.agentTurn({ system: "sys", user: "hi", tools: [echo], maxIterations: 4 });

    expect(result).toEqual({ text: "done.", refused: false, model: "gpt-5" });
    expect(seen).toEqual([{ text: "hi", times: 1 }]);
    const first = client.calls[0] as { tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>; reasoning_effort?: string };
    expect(first.tools[0].function.name).toBe("echo");
    expect(first.tools[0].function.parameters.$schema).toBeUndefined();
    expect(first.reasoning_effort).toBe("medium");
    const second = client.calls[1] as { messages: Array<{ role: string; content?: string; tool_call_id?: string }> };
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "echoed hi x1" });
  });

  it("returns a readable error to the model for bad tool input instead of throwing", async () => {
    const strict = tool({ name: "strict", description: "d", inputSchema: z.object({ n: z.number() }), run: async () => "never" });
    const client = fakeClient([
      assistant(null, [{ id: "c", type: "function", function: { name: "strict", arguments: '{"n":"x"}' } }]),
      assistant("ok"),
    ]);
    const provider = new OpenAIProvider(client, { big: "gpt-4.1", small: "gpt-4.1-mini" });
    await provider.agentTurn({ system: "s", user: "u", tools: [strict], maxIterations: 2 });
    const second = client.calls[1] as { messages: Array<{ role: string; content?: string }> };
    expect(second.messages.at(-1)?.content).toMatch(/invalid input — n:/);
    expect((client.calls[0] as { reasoning_effort?: string }).reasoning_effort).toBeUndefined();
  });

  it("reports refusals and stops at maxIterations", async () => {
    const client = fakeClient([assistant(null, undefined, "no")]);
    const provider = new OpenAIProvider(client, { big: "gpt-5", small: "gpt-5-mini" });
    expect(await provider.agentTurn({ system: "s", user: "u", tools: [], maxIterations: 1 })).toMatchObject({ refused: true, text: "" });
  });
});

describe("OpenAIProvider.structured", () => {
  const Schema = z.object({ addressed: z.boolean() });

  it("sends json_schema output format plus data-URL images and parses through zod", async () => {
    const client = fakeClient([assistant('{"addressed":true}')]);
    const provider = new OpenAIProvider(client, { big: "gpt-5", small: "gpt-5-mini" });
    const result = await provider.structured({ tier: "small", system: "s", text: "t", schema: Schema, images: [{ mime: "image/png", base64: "AAAA" }], effort: "low" });
    expect(result).toEqual({ parsed: { addressed: true }, refused: false, model: "gpt-5-mini" });
    const call = client.calls[0] as { response_format: { type: string; json_schema: { schema: Record<string, unknown> } }; messages: Array<{ content: unknown }> };
    expect(call.response_format.type).toBe("json_schema");
    expect(call.response_format.json_schema.schema.properties).toBeDefined();
    expect(JSON.stringify(call.messages[1].content)).toContain("data:image/png;base64,AAAA");
  });

  it("returns null (not a throw) on malformed or off-schema output", async () => {
    const provider = new OpenAIProvider(fakeClient([assistant("not json"), assistant('{"addressed":"yes"}')]), { big: "gpt-5", small: "gpt-5-mini" });
    expect((await provider.structured({ tier: "big", system: "s", text: "t", schema: Schema })).parsed).toBeNull();
    expect((await provider.structured({ tier: "big", system: "s", text: "t", schema: Schema })).parsed).toBeNull();
  });
});

describe("tool schemas convert for OpenAI", () => {
  it("create_bet's zod schema becomes a JSON schema with its fields", () => {
    const tools = buildTools(
      { store: undefined as never, betStore: undefined as never, engine: undefined as never, ledger: undefined as never, siteUrl: "https://x" },
      { ctx: { userId: "u", chatId: "c", event: { text: "" } } as never, snap: { members: [], openBets: [], sender: { id: "u" }, wallet: { available: 0n, held: 0n }, now: new Date() } as never, replies: [] },
    );
    const createBet = tools.find((t) => t.name === "create_bet")!;
    const json = z.toJSONSchema(createBet.inputSchema, { io: "input" }) as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(json.properties)).toEqual(expect.arrayContaining(["claim", "stake_points", "deadline", "proof_required", "against_user_ids"]));
    expect(json.required).not.toContain("against_user_ids");
  });
});
