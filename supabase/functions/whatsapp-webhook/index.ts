// Meta WhatsApp Cloud API webhook (deploy with verify_jwt = false).
// GET  → verification handshake with WHATSAPP_VERIFY_TOKEN
// POST → validate X-Hub-Signature-256, answer 200 immediately, process in background.
import { handleInbound } from "../_shared/agent/handle.ts";
import { background, llm, provider, store } from "../_shared/runtime/deno.ts";

Deno.serve(async (req) => {
  let p;
  try {
    p = provider();
  } catch (e) {
    console.error("[whatsapp-webhook] provider misconfigured", e);
    return new Response("not configured", { status: 503 });
  }
  if (p.name !== "whatsapp") return new Response("whatsapp provider disabled", { status: 404 });

  if (req.method === "GET")
    return p.verifyWebhook(req) ?? new Response("bad request", { status: 400 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let messages;
  try {
    messages = await p.parseIncoming(req);
  } catch (e) {
    console.warn("[whatsapp-webhook] rejected", (e as Error).message);
    return new Response("invalid signature", { status: 401 });
  }

  const s = store();
  const client = llm();
  background(
    (async () => {
      for (const m of messages) {
        await handleInbound(
          {
            channel: "whatsapp",
            from: m.from,
            text: m.text,
            providerMessageId: m.providerMessageId,
            customerName: m.name,
          },
          { store: s, llm: client, provider: p },
        );
      }
    })(),
  );
  return new Response("ok", { status: 200 });
});
