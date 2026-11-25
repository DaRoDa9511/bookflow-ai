import { describe, expect, it, vi } from "vitest";
import {
  fromGeminiResponse,
  geminiLlm,
  toGeminiContents,
  toGeminiSchema,
  toGeminiTools,
} from "./gemini.ts";
import { TOOL_DEFINITIONS } from "./tools.ts";
import type { ContentBlock, LlmMessage } from "./types.ts";

describe("Gemini adapter", () => {
  it("converts strict JSON Schema to Gemini's OpenAPI subset", () => {
    const s = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      required: ["a"],
      properties: { a: { type: "string" }, b: { type: ["string", "null"], description: "opt" } },
    });
    expect(s).toEqual({
      type: "object",
      required: ["a"],
      properties: {
        a: { type: "string" },
        b: { type: "string", nullable: true, description: "opt" },
      },
    });
    const tools = toGeminiTools(TOOL_DEFINITIONS)[0].functionDeclarations;
    expect(tools).toHaveLength(9);
    expect(tools.find((t) => t.name === "list_services")).not.toHaveProperty("parameters");
    expect(JSON.stringify(tools)).not.toMatch(/additionalProperties|"strict"/);
  });

  it("maps function calls and results both ways, replaying raw parts", () => {
    const res = fromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: "thinking", thought: true },
              { functionCall: { name: "list_services", args: {} }, thoughtSignature: "SIG" },
            ],
          },
          finishReason: "STOP",
        },
      ],
    });
    expect(res.stop_reason).toBe("tool_use");
    const use = res.content.find((b) => b.type === "tool_use") as ContentBlock & { id: string };
    const history: LlmMessage[] = [
      { role: "user", content: "hola" },
      { role: "assistant", content: res.content },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: use.id, content: '[{"id":"s1"}]' }],
      },
    ];
    const contents = toGeminiContents(history);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[1].parts).toContainEqual({
      functionCall: { name: "list_services", args: {} },
      thoughtSignature: "SIG",
    });
    expect(contents[2].parts[0]).toEqual({
      functionResponse: { name: "list_services", response: { result: [{ id: "s1" }] } },
    });
  });

  it("treats safety blocks as refusals and plain text as end of turn", () => {
    expect(fromGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }).stop_reason).toBe(
      "refusal",
    );
    const ok = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: "¡Hola!" }] }, finishReason: "STOP" }],
    });
    expect(ok.stop_reason).toBe("end_turn");
    expect(ok.content[0]).toMatchObject({ type: "text", text: "¡Hola!" });
  });

  it("calls generateContent with the API key header and surfaces API errors", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          }),
        ),
    );
    const llm = geminiLlm({
      apiKey: "k",
      model: "gemini-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const r = await llm.create({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: TOOL_DEFINITIONS,
      maxTokens: 100,
    });
    expect(r.content[0]).toMatchObject({ text: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-test:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    expect(JSON.parse(init.body as string).systemInstruction.parts[0].text).toBe("sys");

    const bad = geminiLlm({
      apiKey: "k",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: "quota" } }), {
          status: 429,
        })) as unknown as typeof fetch,
    });
    await expect(
      bad.create({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        tools: [],
        maxTokens: 10,
      }),
    ).rejects.toThrow(/quota/);
  });
});
