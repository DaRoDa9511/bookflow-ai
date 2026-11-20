// POST { conversation_id, text, release?: boolean }  (JWT of the business owner)
// Manual reply from the inbox. Stores it and, for WhatsApp conversations, sends it
// through the active provider. `release: true` hands the chat back to the bot.
import { errorJson, json, preflight } from "../_shared/http.ts";
import { assertOwner, provider, store, userClient } from "../_shared/runtime/deno.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("method_not_allowed", 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return errorJson("forbidden", 401);

  let body: { conversation_id?: string; text?: string; release?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json");
  }
  if (!body.conversation_id) return errorJson("invalid_input");

  // RLS: the owner can only read conversations of their own business.
  const { data: conv } = await userClient(auth)
    .from("conversations")
    .select("id, business_id, customer_id, phone, channel, handoff_to_human, state")
    .eq("id", body.conversation_id)
    .maybeSingle();
  if (!conv?.business_id) return errorJson("forbidden", 403);
  let userId: string;
  try {
    userId = await assertOwner(auth, conv.business_id);
  } catch {
    return errorJson("forbidden", 403);
  }

  const s = store();
  const text = (body.text ?? "").trim().slice(0, 2000);
  if (text) {
    await s.addMessage(conv, {
      role: "assistant",
      direction: "out",
      content: text,
      tool_name: "human",
      tool_payload: { by: "human", user_id: userId },
    });
    if (conv.channel === "whatsapp") {
      try {
        await provider().sendText(conv.phone, text);
      } catch (e) {
        return errorJson((e as Error).message, 502);
      }
    }
  }
  if (typeof body.release === "boolean") await s.setHandoff(conv.id, !body.release, "manual");
  return json({ ok: true });
});
