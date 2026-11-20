// POST { business_id, phone, text }  (JWT of the business owner)
// Runs the same agent pipeline as WhatsApp, on the "simulator" channel.
import { handleInbound } from "../_shared/agent/handle.ts";
import { errorJson, json, preflight } from "../_shared/http.ts";
import { SimulatorProvider } from "../_shared/messaging/provider.ts";
import { assertOwner, llm, store } from "../_shared/runtime/deno.ts";

const E164 = /^\+[1-9]\d{7,14}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("method_not_allowed", 405);

  let body: { business_id?: string; phone?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json");
  }
  const text = (body.text ?? "").trim();
  if (!body.business_id || !text || !body.phone || !E164.test(body.phone) || text.length > 2000) {
    return errorJson("invalid_input");
  }

  try {
    await assertOwner(req.headers.get("Authorization"), body.business_id);
  } catch {
    return errorJson("forbidden", 403);
  }

  try {
    const result = await handleInbound(
      { channel: "simulator", from: body.phone, text, businessId: body.business_id },
      { store: store(), llm: llm(), provider: new SimulatorProvider() },
    );
    return json(result);
  } catch (e) {
    console.error("[simulator-message]", e);
    return errorJson("internal_error", 500);
  }
});
