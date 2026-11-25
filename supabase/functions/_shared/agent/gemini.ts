// Google Gemini adapter (free tier available) for the agent's LlmClient interface.
// Uses the REST generateContent endpoint with function calling. The agent core keeps
// its Messages-API-shaped history; this file translates both ways and keeps every
// raw Gemini part (including fields such as thoughtSignature) so it is replayed
// unchanged on the next request of the same turn.
import type {
  ContentBlock,
  LlmClient,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  ToolDefinition,
  ToolResultBlock,
} from "./types.ts";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

type JsonSchema = Record<string, unknown>;

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  [key: string]: unknown;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Converts our JSON Schema to the OpenAPI subset Gemini accepts. */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "strict" || key === "$schema") continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (types.length !== value.length) out.nullable = true;
      continue;
    }
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([k, v]) => [k, toGeminiSchema(v)]),
      );
      continue;
    }
    if (key === "items" && value && typeof value === "object") {
      out.items = toGeminiSchema(value as JsonSchema);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function toGeminiTools(tools: ToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((t) => {
        const props = (t.input_schema.properties ?? {}) as Record<string, unknown>;
        const decl: Record<string, unknown> = { name: t.name, description: t.description };
        if (Object.keys(props).length > 0) decl.parameters = toGeminiSchema(t.input_schema);
        return decl;
      }),
    },
  ];
}

/** Translates the agent's message history to Gemini `contents`. */
export function toGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  const toolNames = new Map<string, string>();
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      contents.push({ role, parts: [{ text: m.content }] });
      continue;
    }
    const parts: GeminiPart[] = [];
    for (const block of m.content) {
      const raw = (block as { _gemini?: GeminiPart })._gemini;
      if (block.type === "tool_use") {
        const b = block as { id: string; name: string; input: unknown };
        toolNames.set(b.id, b.name);
        parts.push(
          raw ?? {
            functionCall: { name: b.name, args: (b.input ?? {}) as Record<string, unknown> },
          },
        );
      } else if (block.type === "tool_result") {
        const r = block as ToolResultBlock;
        let parsed: unknown = r.content;
        try {
          parsed = JSON.parse(r.content);
        } catch {
          /* plain text result */
        }
        const name = toolNames.get(r.tool_use_id) ?? "tool";
        const response = r.is_error ? { error: parsed } : { result: parsed };
        const callId = r.tool_use_id.startsWith("gem_") ? undefined : r.tool_use_id;
        parts.push({ functionResponse: { name, response, ...(callId ? { id: callId } : {}) } });
      } else if (raw) {
        parts.push(raw);
      } else if (block.type === "text") {
        parts.push({ text: (block as { text: string }).text });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

/** Translates a Gemini candidate back to Messages-API-shaped content blocks. */
export function fromGeminiResponse(json: {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}): LlmResponse {
  if (json.promptFeedback?.blockReason) return { content: [], stop_reason: "refusal" };
  const cand = json.candidates?.[0];
  if (!cand) return { content: [], stop_reason: "refusal" };
  const parts = cand.content?.parts ?? [];
  let seq = 0;
  const content: ContentBlock[] = [];
  for (const part of parts) {
    if (part.functionCall) {
      content.push({
        type: "tool_use",
        id: part.functionCall.id ?? `gem_${Date.now()}_${seq++}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
        _gemini: part,
      } as ContentBlock);
    } else if (typeof part.text === "string" && !part.thought) {
      content.push({ type: "text", text: part.text, _gemini: part } as ContentBlock);
    } else {
      content.push({ type: "gemini_part", _gemini: part });
    }
  }
  const hasCall = content.some((b) => b.type === "tool_use");
  const blocked = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(
    cand.finishReason ?? "",
  );
  return {
    content,
    stop_reason: hasCall
      ? "tool_use"
      : blocked
        ? "refusal"
        : cand.finishReason === "MAX_TOKENS"
          ? "max_tokens"
          : "end_turn",
  };
}

export function geminiLlm(opts: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): LlmClient {
  const model = opts.model || DEFAULT_GEMINI_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async create(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
      const res = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: toGeminiContents(req.messages),
            tools: toGeminiTools(req.tools),
            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
            generationConfig: { maxOutputTokens: req.maxTokens, temperature: 0.3 },
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
        throw new Error(`gemini_error: ${msg}`);
      }
      return fromGeminiResponse(json as Parameters<typeof fromGeminiResponse>[0]);
    },
  };
}
