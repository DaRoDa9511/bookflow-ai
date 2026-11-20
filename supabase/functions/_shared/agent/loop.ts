// Tool-use loop: calls Claude, runs requested tools (max 5 per turn), feeds the
// results back, and returns the final text. Any model error or timeout produces
// an apology and a handoff to a human.
import { TOOL_DEFINITIONS, TOOL_ERROR_HINTS, executeTool, type ToolContext } from "./tools.ts";
import {
  AgentError,
  type ContentBlock,
  type LlmClient,
  type LlmMessage,
  type ToolResultBlock,
  type ToolUseBlock,
} from "./types.ts";

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  handoff: boolean;
  error?: string;
}

export const MAX_TOOL_CALLS = 5;
export const TURN_TIMEOUT_MS = 25_000;

export const APOLOGY =
  "Disculpa, tuve un problema para responderte 🙏 Ya avisé al equipo y una persona te contestará pronto.\n(Sorry, I had a problem answering. A team member will reply soon.)";

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function runAgentTurn(params: {
  llm: LlmClient;
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  userText: string;
  toolContext: ToolContext;
  timeoutMs?: number;
  maxToolCalls?: number;
}): Promise<AgentTurnResult> {
  const { llm, system, toolContext } = params;
  const timeoutMs = params.timeoutMs ?? TURN_TIMEOUT_MS;
  const maxToolCalls = params.maxToolCalls ?? MAX_TOOL_CALLS;
  const toolCalls: ToolCallRecord[] = [];

  // History must alternate and start with a user message.
  const messages: LlmMessage[] = [];
  for (const m of params.history) {
    const last = messages.at(-1);
    if (!last && m.role === "assistant") continue;
    if (last && last.role === m.role) last.content = `${last.content as string}\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  if (messages.at(-1)?.role === "user") {
    messages[messages.length - 1].content =
      `${messages.at(-1)!.content as string}\n${params.userText}`;
  } else {
    messages.push({ role: "user", content: params.userText });
  }

  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fail = async (error: string): Promise<AgentTurnResult> => {
    try {
      await toolContext.store.setHandoff(
        toolContext.conversationId,
        true,
        `agent_error: ${error}`.slice(0, 200),
      );
    } catch {
      /* best effort */
    }
    return { reply: APOLOGY, toolCalls, handoff: true, error };
  };

  try {
    for (let iteration = 0; iteration < maxToolCalls + 2; iteration++) {
      if (Date.now() > deadline) return await fail("timeout");
      const res = await llm.create(
        { system, messages, tools: TOOL_DEFINITIONS, maxTokens: 1024 },
        controller.signal,
      );

      if (res.stop_reason === "refusal") return await fail("refusal");

      if (res.stop_reason !== "tool_use") {
        const reply = textOf(res.content);
        if (!reply) return await fail("empty_reply");
        return { reply, toolCalls, handoff: Boolean(toolContext.handoff) };
      }

      // Pass the assistant content back unchanged (it may include thinking blocks).
      messages.push({ role: "assistant", content: res.content });
      const uses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      const results: ToolResultBlock[] = [];
      for (const use of uses) {
        if (toolCalls.length >= maxToolCalls) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content:
              "Tool call limit reached for this message. Answer the customer now with what you have.",
          });
          continue;
        }
        let result: unknown;
        let isError = false;
        try {
          result = await executeTool(use.name, use.input, toolContext);
        } catch (e) {
          isError = true;
          const code = e instanceof AgentError ? e.code : "internal_error";
          result = { error: code, hint: TOOL_ERROR_HINTS[code] ?? "The action failed." };
        }
        toolCalls.push({ name: use.name, input: use.input, result, isError });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result),
          ...(isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }
    return await fail("too_many_iterations");
  } catch (e) {
    return await fail(
      controller.signal.aborted
        ? "timeout"
        : e instanceof Error
          ? e.message.slice(0, 120)
          : "error",
    );
  } finally {
    clearTimeout(timer);
  }
}
