// Messaging providers. The agent never talks to WhatsApp directly: everything goes
// through MessagingProvider so the simulator and the real Cloud API are swappable
// with MESSAGING_PROVIDER=simulator|whatsapp.

export interface IncomingMessage {
  from: string; // E.164 with "+"
  text: string;
  providerMessageId: string;
  name?: string | null;
  timestamp?: number;
}

export interface MessagingProvider {
  readonly name: "simulator" | "whatsapp";
  sendText(to: string, text: string): Promise<{ id?: string }>;
  sendTemplate(
    to: string,
    template: string,
    params: string[],
    lang?: string,
  ): Promise<{ id?: string }>;
  /** GET verification handshake. Returns the response to send, or null if not a verification request. */
  verifyWebhook(req: Request): Response | null;
  /** Validates the signature and extracts text messages from a webhook POST. */
  parseIncoming(req: Request): Promise<IncomingMessage[]>;
}

/** Template bodies, used to render templates as text in the simulator. */
export const TEMPLATES: Record<string, (p: string[]) => string> = {
  booking_reminder: ([name, service, when, business]) =>
    `Hola ${name} 👋 Te recordamos tu cita de ${service} el ${when} en ${business}. Responde *Confirmar*, *Reprogramar* o *Cancelar*.`,
  booking_confirmation: ([name, service, when, business]) =>
    `¡Listo ${name}! Tu cita de ${service} quedó confirmada para el ${when} en ${business}.`,
};

/**
 * Simulator: outgoing messages are already stored in `messages` by the agent and
 * shown in the panel through Realtime, so "sending" is a no-op.
 */
export class SimulatorProvider implements MessagingProvider {
  readonly name = "simulator" as const;
  async sendText(): Promise<{ id?: string }> {
    return {};
  }
  async sendTemplate(): Promise<{ id?: string }> {
    return {};
  }
  verifyWebhook(): Response | null {
    return new Response("simulator provider: webhook disabled", { status: 404 });
  }
  async parseIncoming(): Promise<IncomingMessage[]> {
    return [];
  }
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  graphVersion?: string;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

interface MetaWebhook {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          timestamp?: string;
          type: string;
          text?: { body: string };
          button?: { text: string };
          interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
        }[];
      };
    }[];
  }[];
}

/** Extracts text-like messages (text, quick-reply buttons, interactive replies). */
export function extractMessages(payload: MetaWebhook): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      for (const m of v?.messages ?? []) {
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title;
        if (!text) continue;
        out.push({
          from: `+${m.from.replace(/^\+/, "")}`,
          text,
          providerMessageId: m.id,
          name: v?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null,
          timestamp: m.timestamp ? Number(m.timestamp) : undefined,
        });
      }
    }
  }
  return out;
}

export class WhatsAppCloudProvider implements MessagingProvider {
  readonly name = "whatsapp" as const;
  constructor(
    private cfg: WhatsAppConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(body: Record<string, unknown>) {
    const url = `https://graph.facebook.com/${this.cfg.graphVersion ?? "v21.0"}/${this.cfg.phoneNumberId}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message: string };
    };
    if (!res.ok) throw new Error(`whatsapp_send_failed: ${json.error?.message ?? res.status}`);
    return { id: json.messages?.[0]?.id };
  }

  sendText(to: string, text: string) {
    return this.post({
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body: text, preview_url: false },
    });
  }

  sendTemplate(to: string, template: string, params: string[], lang = "es") {
    return this.post({
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    });
  }

  verifyWebhook(req: Request): Response | null {
    const url = new URL(req.url);
    if (req.method !== "GET") return null;
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && timingSafeEqual(token, this.cfg.verifyToken)) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  async parseIncoming(req: Request): Promise<IncomingMessage[]> {
    const raw = await req.text();
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    const expected = `sha256=${await hmacSha256Hex(this.cfg.appSecret, raw)}`;
    if (!timingSafeEqual(signature, expected)) throw new Error("invalid_signature");
    return extractMessages(JSON.parse(raw) as MetaWebhook);
  }
}

export function providerFromEnv(
  get: (k: string) => string | undefined,
  fetchImpl?: typeof fetch,
): MessagingProvider {
  if ((get("MESSAGING_PROVIDER") ?? "simulator") === "whatsapp") {
    const cfg = {
      token: get("WHATSAPP_TOKEN") ?? "",
      phoneNumberId: get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
      verifyToken: get("WHATSAPP_VERIFY_TOKEN") ?? "",
      appSecret: get("WHATSAPP_APP_SECRET") ?? "",
      graphVersion: get("WHATSAPP_GRAPH_VERSION"),
    };
    if (!cfg.token || !cfg.phoneNumberId || !cfg.verifyToken || !cfg.appSecret) {
      throw new Error("MESSAGING_PROVIDER=whatsapp but WHATSAPP_* secrets are missing");
    }
    return new WhatsAppCloudProvider(cfg, fetchImpl);
  }
  return new SimulatorProvider();
}
