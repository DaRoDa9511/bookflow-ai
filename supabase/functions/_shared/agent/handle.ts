// Orchestrates one inbound message: idempotency → rate limit → identify the
// business → persist → run the agent → persist tool calls and reply → send.
import type { MessagingProvider } from "../messaging/provider.ts";
import { runAgentTurn, type ToolCallRecord } from "./loop.ts";
import { buildSystemPrompt } from "./prompt.ts";
import type { SqlStore } from "./store.ts";
import type { ConversationRow, LlmClient } from "./types.ts";

export const RATE_LIMIT_PER_HOUR = 30;

export interface InboundInput {
  channel: "whatsapp" | "simulator";
  from: string;
  text: string;
  providerMessageId?: string | null;
  /** Simulator: the business is known (the owner is testing their own bot). */
  businessId?: string | null;
  customerName?: string | null;
}

export interface InboundResult {
  status: "duplicate" | "rate_limited" | "needs_business" | "handoff_active" | "replied";
  conversationId?: string;
  reply?: string;
  toolCalls?: ToolCallRecord[];
  handoff?: boolean;
}

const CODE_RE = /\b([A-Za-z0-9]{4,12})\b/g;

const looksEnglish = (t: string) =>
  /\b(hi|hello|hey|book|booking|appointment|please|thanks|cancel|when)\b/i.test(t);

async function detectCode(store: SqlStore, text: string) {
  for (const m of [...text.matchAll(CODE_RE)].slice(0, 12)) {
    if (!/[A-Z]/.test(m[1]) || m[1] !== m[1].toUpperCase()) continue; // codes are written in caps
    const biz = await store.findBusinessByCode(m[1]);
    if (biz) return biz;
  }
  // Fall back to case-insensitive match on the whole word list (e.g. "hola donpepe").
  for (const m of [...text.matchAll(CODE_RE)].slice(0, 12)) {
    const biz = await store.findBusinessByCode(m[1]);
    if (biz) return biz;
  }
  return null;
}

export async function handleInbound(
  input: InboundInput,
  deps: { store: SqlStore; llm: LlmClient; provider: MessagingProvider; now?: () => Date },
): Promise<InboundResult> {
  const { store, llm, provider } = deps;
  const now = deps.now ?? (() => new Date());
  const text = input.text.trim().slice(0, 2000);
  if (!text) return { status: "replied", reply: "" };

  if (input.providerMessageId && (await store.messageExists(input.providerMessageId))) {
    return { status: "duplicate" };
  }

  // ── identify the business and the conversation ──────────────────
  let conversation: ConversationRow | null = null;
  const coded = await detectCode(store, text);
  const businessId = coded?.id ?? input.businessId ?? null;

  if (businessId) {
    conversation =
      (await store.findConversation(input.from, input.channel, businessId)) ??
      (await store.createConversation(input.from, input.channel, businessId));
  } else {
    conversation = await store.findConversation(input.from, input.channel, null);
    if (!conversation)
      conversation = await store.createConversation(input.from, input.channel, null);
  }

  const send = async (reply: string, extra?: Partial<InboundResult>): Promise<InboundResult> => {
    await store.addMessage(conversation!, { role: "assistant", direction: "out", content: reply });
    await provider.sendText(input.from, reply);
    return { status: "replied", conversationId: conversation!.id, reply, ...extra };
  };

  // ── rate limit (per phone, all businesses) ──────────────────────
  const count = await store.countInboundLastHour(input.from);
  await store.addMessage(conversation, {
    role: "user",
    direction: "in",
    content: text,
    provider_message_id: input.providerMessageId ?? null,
  });
  if (count >= RATE_LIMIT_PER_HOUR) {
    if (count === RATE_LIMIT_PER_HOUR) {
      await send(
        looksEnglish(text)
          ? "You've sent many messages in a short time. Please try again in a little while 🙏"
          : "Recibimos muchos mensajes seguidos. Por favor intenta de nuevo en un rato 🙏",
      );
    }
    return { status: "rate_limited", conversationId: conversation.id };
  }

  // ── no business yet: ask for the code or match by name ──────────
  if (!conversation.business_id) {
    const matches = await store.searchBusinesses(text);
    if (matches.length === 1) {
      await store.attachBusiness(conversation.id, matches[0].id);
      conversation = { ...conversation, business_id: matches[0].id };
    } else {
      const en = looksEnglish(text);
      const list = matches.map((m) => `• ${m.name}: ${m.booking_code}`).join("\n");
      const reply = matches.length
        ? en
          ? `Which business do you mean? Reply with its code:\n${list}`
          : `¿Con cuál negocio quieres reservar? Responde con su código:\n${list}`
        : en
          ? "Hi! 👋 I'm the BookFlow booking assistant. Which business would you like to book with? Send me its code (e.g. DONPEPE) or its name."
          : "¡Hola! 👋 Soy el asistente de reservas de BookFlow. ¿Con qué negocio quieres reservar? Escríbeme su código (ej. DONPEPE) o su nombre.";
      const r = await send(reply);
      return { ...r, status: "needs_business" };
    }
  }

  const bizId = conversation.business_id!;
  if (!conversation.customer_id) {
    const customerId = await store.upsertCustomer(bizId, input.from, input.customerName ?? null);
    await store.setConversationCustomer(conversation.id, customerId);
    conversation = { ...conversation, customer_id: customerId };
  }

  if (conversation.handoff_to_human) {
    return { status: "handoff_active", conversationId: conversation.id };
  }

  const ctx = await store.businessContext(bizId);
  if (!ctx || ctx.business.status !== "active") {
    return send(
      "Este negocio no está disponible en este momento. / This business is not available right now.",
    );
  }

  const history = (await store.history(conversation.id, 21)).slice(0, -1); // exclude the message just stored
  const customerName = conversation.customer_id
    ? await store.customerName(conversation.customer_id)
    : null;
  const toolContext = {
    store,
    ctx,
    phone: input.from,
    conversationId: conversation.id,
    now: now(),
  };
  const turn = await runAgentTurn({
    llm,
    system: buildSystemPrompt(ctx, {
      now: toolContext.now,
      customerName,
      customerPhone: input.from,
    }),
    history,
    userText: text,
    toolContext,
  });

  for (const call of turn.toolCalls) {
    await store.addMessage(conversation, {
      role: "tool",
      direction: "out",
      content: call.isError ? `error: ${call.name}` : call.name,
      tool_name: call.name,
      tool_payload: { input: call.input, result: call.result, is_error: call.isError },
    });
  }
  return send(turn.reply, { toolCalls: turn.toolCalls, handoff: turn.handoff });
}
