import { describe, expect, it, vi } from "vitest";
import {
  extractMessages,
  hmacSha256Hex,
  providerFromEnv,
  SimulatorProvider,
  TEMPLATES,
  WhatsAppCloudProvider,
} from "./provider.ts";

const cfg = { token: "tkn", phoneNumberId: "123", verifyToken: "verify-me", appSecret: "s3cret" };

const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "573001112233", profile: { name: "Ana" } }],
            messages: [
              { id: "wamid.A", from: "573001112233", type: "text", text: { body: "Hola DONPEPE" } },
              {
                id: "wamid.B",
                from: "573001112233",
                type: "button",
                button: { text: "Confirmar" },
              },
              { id: "wamid.C", from: "573001112233", type: "image" },
            ],
          },
        },
      ],
    },
  ],
};

describe("messaging providers", () => {
  it("defaults to the simulator", () => {
    expect(providerFromEnv(() => undefined)).toBeInstanceOf(SimulatorProvider);
    expect(() =>
      providerFromEnv((k) => (k === "MESSAGING_PROVIDER" ? "whatsapp" : undefined)),
    ).toThrow(/WHATSAPP_/);
  });

  it("answers Meta's verification handshake only with the right token", () => {
    const p = new WhatsAppCloudProvider(cfg);
    const ok = p.verifyWebhook(
      new Request("https://x/fn?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"),
    );
    expect(ok?.status).toBe(200);
    const bad = p.verifyWebhook(
      new Request("https://x/fn?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"),
    );
    expect(bad?.status).toBe(403);
  });

  it("validates X-Hub-Signature-256 and extracts text messages", async () => {
    const p = new WhatsAppCloudProvider(cfg);
    const raw = JSON.stringify(payload);
    const sig = `sha256=${await hmacSha256Hex(cfg.appSecret, raw)}`;
    const msgs = await p.parseIncoming(
      new Request("https://x", {
        method: "POST",
        body: raw,
        headers: { "x-hub-signature-256": sig },
      }),
    );
    expect(msgs).toEqual([
      expect.objectContaining({
        from: "+573001112233",
        text: "Hola DONPEPE",
        providerMessageId: "wamid.A",
        name: "Ana",
      }),
      expect.objectContaining({ text: "Confirmar", providerMessageId: "wamid.B" }),
    ]);
    await expect(
      p.parseIncoming(
        new Request("https://x", {
          method: "POST",
          body: raw,
          headers: { "x-hub-signature-256": "sha256=bad" },
        }),
      ),
    ).rejects.toThrow(/invalid_signature/);
  });

  it("sends text and templates through the Graph API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 }),
    );
    const p = new WhatsAppCloudProvider(cfg, fetchMock as unknown as typeof fetch);
    await expect(p.sendText("+573001112233", "hola")).resolves.toEqual({ id: "wamid.out" });
    await p.sendTemplate("+573001112233", "booking_reminder", [
      "Ana",
      "Corte",
      "mañana 10:00",
      "Don Pepe",
    ]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(JSON.parse(calls[0][1].body as string)).toMatchObject({
      to: "573001112233",
      type: "text",
    });
    expect(JSON.parse(calls[1][1].body as string).template).toMatchObject({
      name: "booking_reminder",
    });
  });

  it("renders templates as text for the simulator", () => {
    expect(TEMPLATES.booking_reminder(["Ana", "Corte", "mañana 10:00", "Don Pepe"])).toMatch(
      /Confirmar/,
    );
    expect(extractMessages({})).toEqual([]);
  });
});
