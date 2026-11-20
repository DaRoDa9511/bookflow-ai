// Adapts the official Anthropic SDK to the agent's LlmClient interface.
// Short WhatsApp replies → low effort. Server-side refusal fallbacks are enabled;
// if the API rejects that beta for this account we retry once without it.
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.ts";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function anthropicLlm(opts: {
  apiKey: string;
  model?: string;
  fallbacks?: boolean;
}): LlmClient {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 22_000 });
  const model = opts.model || DEFAULT_MODEL;
  let useFallbacks = opts.fallbacks ?? true;

  async function create(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const body = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      tools: req.tools,
      messages: req.messages,
      output_config: { effort: "low" },
    };
    try {
      const res = useFallbacks
        ? await client.beta.messages.create(
            { ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never,
            { signal },
          )
        : await client.messages.create(body as never, { signal });
      const msg = res as unknown as LlmResponse;
      return { content: msg.content, stop_reason: msg.stop_reason };
    } catch (e) {
      if (
        useFallbacks &&
        e instanceof Anthropic.BadRequestError &&
        /fallback|beta/i.test(e.message)
      ) {
        useFallbacks = false;
        return create(req, signal);
      }
      throw e;
    }
  }

  return { create };
}
