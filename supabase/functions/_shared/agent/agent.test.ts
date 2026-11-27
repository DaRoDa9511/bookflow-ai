import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS } from "../../../tests/helpers/db.ts";
import { SimulatorProvider } from "../messaging/provider.ts";
import { addDays, localDate, weekdayOf } from "../time.ts";
import { handleInbound, RATE_LIMIT_PER_HOUR } from "./handle.ts";
import { APOLOGY } from "./loop.ts";
import { SqlStore } from "./store.ts";
import type { ContentBlock, LlmClient, LlmRequest, LlmResponse, ToolResultBlock } from "./types.ts";

let db: PGlite;
let store: SqlStore;
const provider = new SimulatorProvider();

beforeAll(async () => {
  db = await createTestDb();
  store = new SqlStore(
    async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[],
  );
});

const TZ = "America/Bogota";
function weekdayAhead(days: number): string {
  let d = addDays(localDate(new Date(), TZ), days);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
  return d;
}

// ── scripted Claude mock ─────────────────────────────────────────────
type Step = (req: LlmRequest) => LlmResponse;
let toolSeq = 0;
const toolUse = (name: string, input: unknown): LlmResponse => ({
  stop_reason: "tool_use",
  content: [
    { type: "thinking", thinking: "", signature: "sig" } as ContentBlock,
    { type: "tool_use", id: `tu_${++toolSeq}`, name, input },
  ],
});
const say = (text: string): LlmResponse => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
});

/** Last tool result returned to the model, parsed. */
function lastResult<T = Record<string, unknown>>(req: LlmRequest): T {
  const last = req.messages.at(-1)!;
  const block = (last.content as ToolResultBlock[]).find((b) => b.type === "tool_result")!;
  return JSON.parse(block.content) as T;
}

function scripted(steps: Step[]): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    async create(req) {
      requests.push(structuredClone(req));
      const step = steps[requests.length - 1];
      if (!step) throw new Error("unexpected extra LLM call");
      return step(req);
    },
  };
}

const phone = (n: number) => `+57310000${String(n).padStart(4, "0")}`;

async function bookingsOf(p: string) {
  return (
    await db.query<{
      id: string;
      status: string;
      source: string;
      starts_at: Date;
      staff_id: string;
    }>(
      `select b.id, b.status, b.source, b.starts_at, b.staff_id from bookings b
       join customers c on c.id = b.customer_id where c.phone = $1 order by b.created_at`,
      [p],
    )
  ).rows;
}

describe("AI agent (Claude mocked) on the real schema", () => {
  it("answers an FAQ from the knowledge base and identifies the business by code", async () => {
    const llm = scripted([
      () => toolUse("get_business_info", {}),
      (req) => {
        const info = lastResult<{ knowledge_base: { title: string }[] }>(req);
        expect(info.knowledge_base.map((k) => k.title)).toContain("Ubicación y parqueadero");
        return say("Sí, hay parqueadero público en la esquina, gratis la primera hora.");
      },
    ]);
    const r = await handleInbound(
      { channel: "simulator", from: phone(1), text: "Hola DONPEPE, ¿tienen parqueadero?" },
      { store, llm, provider },
    );
    expect(r.status).toBe("replied");
    expect(r.reply).toMatch(/parqueadero/);
    expect(llm.requests[0].system).toContain("Barbería Don Pepe");
    expect(llm.requests[0].system).toContain("Calle 85");
    // the thinking block is passed back untouched within the turn
    expect(JSON.stringify(llm.requests[1].messages)).toContain('"signature":"sig"');
    const msgs = await db.query<{ role: string }>(
      "select role from messages where conversation_id = $1 order by created_at",
      [r.conversationId],
    );
    expect(msgs.rows.map((m) => m.role)).toEqual(["user", "tool", "assistant"]);
  });

  it("books an appointment end to end and the booking shows up with source whatsapp", async () => {
    const day = weekdayAhead(3);
    const llm = scripted([
      () => toolUse("list_services", {}),
      (req) => {
        const services = lastResult<{ id: string; name: string }[]>(req);
        const corte = services.find((s) => s.name === "Corte clásico")!;
        return toolUse("find_available_slots", {
          service_id: corte.id,
          staff_id: null,
          date_from: day,
          date_to: null,
          preferred_time: "10:00",
        });
      },
      (req) => {
        const r = lastResult<{ slots: { start: string; staff_id: string; local_time: string }[] }>(
          req,
        );
        expect(r.slots.length).toBeGreaterThan(0);
        expect(r.slots.length).toBeLessThanOrEqual(6);
        expect(r.slots[0].local_time).toMatch(/10:00/);
        return toolUse("create_booking", {
          service_id: IDS.corte,
          staff_id: r.slots[0].staff_id,
          start: r.slots[0].start,
          customer_name: "Laura Prueba",
        });
      },
      (req) => {
        const r = lastResult<{ status: string; local_time: string }>(req);
        expect(r.status).toBe("confirmed");
        return say(`¡Listo Laura! Tu corte quedó para el ${r.local_time}.`);
      },
    ]);
    const res = await handleInbound(
      { channel: "simulator", from: phone(2), text: "Hola DONPEPE quiero un corte" },
      { store, llm, provider },
    );
    expect(res.reply).toMatch(/Listo Laura/);
    const bookings = await bookingsOf(phone(2));
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ status: "confirmed", source: "whatsapp" });
  });

  it("records the customer's attendance confirmation (reply 'Confirmar')", async () => {
    const llm = scripted([
      () => toolUse("confirm_attendance", { booking_id: null }),
      (req) => {
        expect(lastResult<{ status: string }>(req).status).toBe("attendance_confirmed");
        return say("¡Gracias por confirmar! Te esperamos.");
      },
    ]);
    await handleInbound(
      { channel: "simulator", from: phone(2), text: "Confirmar" },
      { store, llm, provider },
    );
    const { rows } = await db.query<{ c: Date | null }>(
      "select b.customer_confirmed_at c from bookings b join customers cu on cu.id = b.customer_id where cu.phone = $1",
      [phone(2)],
    );
    expect(rows[0].c).not.toBeNull();
  });

  it("reschedules the customer's own appointment using list_my_bookings", async () => {
    const before = (await bookingsOf(phone(2)))[0];
    const day = weekdayAhead(5);
    const llm = scripted([
      () => toolUse("list_my_bookings", {}),
      (req) => {
        const mine = lastResult<{ booking_id: string; service_id: string }[]>(req);
        expect(mine).toHaveLength(1);
        return toolUse("find_available_slots", {
          service_id: mine[0].service_id,
          staff_id: null,
          date_from: day,
          date_to: null,
          preferred_time: "afternoon",
        });
      },
      (req) => {
        const r = lastResult<{ slots: { start: string; staff_id: string }[] }>(req);
        return toolUse("reschedule_booking", {
          booking_id: before.id,
          new_start: r.slots[0].start,
          staff_id: r.slots[0].staff_id,
        });
      },
      (req) => {
        expect(lastResult<{ status: string }>(req).status).toBe("rescheduled");
        return say("Hecho, tu cita quedó reprogramada.");
      },
    ]);
    // No code this time: the last active conversation identifies the business.
    const res = await handleInbound(
      { channel: "simulator", from: phone(2), text: "¿Puedo moverla para otro día en la tarde?" },
      { store, llm, provider },
    );
    expect(res.status).toBe("replied");
    const after = (await bookingsOf(phone(2)))[0];
    expect(after.starts_at.getTime()).not.toBe(before.starts_at.getTime());
    const confirmed = await db.query<{ c: Date | null }>(
      "select customer_confirmed_at c from bookings where id = $1",
      [before.id],
    );
    expect(confirmed.rows[0].c).toBeNull(); // a moved appointment must be confirmed again
    const reminders = await db.query<{ n: number }>(
      "select count(*)::int n from reminders where booking_id = $1 and status = 'scheduled'",
      [before.id],
    );
    expect(reminders.rows[0].n).toBe(2);
  });

  it("cancels an appointment and frees the slot", async () => {
    const llm = scripted([
      () => toolUse("list_my_bookings", {}),
      (req) =>
        toolUse("cancel_booking", {
          booking_id: lastResult<{ booking_id: string }[]>(req)[0].booking_id,
          reason: null,
        }),
      (req) => {
        expect(lastResult<{ status: string }>(req).status).toBe("cancelled");
        return say("Tu cita fue cancelada.");
      },
    ]);
    await handleInbound(
      { channel: "simulator", from: phone(2), text: "Quiero cancelar mi cita" },
      { store, llm, provider },
    );
    expect((await bookingsOf(phone(2)))[0].status).toBe("cancelled");
  });

  it("reports a full day (business closed) and a slot taken by someone else", async () => {
    const day = weekdayAhead(9);
    await db.query(
      "insert into time_off (business_id, staff_id, starts_at, ends_at, reason) values ($1, null, ($2::date)::timestamp at time zone $3, ($2::date + 1)::timestamp at time zone $3, 'Festivo')",
      [IDS.donPepe, day, TZ],
    );
    let takenStart = "";
    const llm = scripted([
      () =>
        toolUse("find_available_slots", {
          service_id: IDS.corte,
          staff_id: IDS.staffAndres,
          date_from: day,
          date_to: null,
          preferred_time: null,
        }),
      (req) => {
        const r = lastResult<{ slots: unknown[]; note: string }>(req);
        expect(r.slots).toHaveLength(0);
        expect(r.note).toMatch(/No free times/);
        return toolUse("find_available_slots", {
          service_id: IDS.corte,
          staff_id: IDS.staffAndres,
          date_from: addDays(day, 1),
          date_to: null,
          preferred_time: null,
        });
      },
      (req) => {
        const r = lastResult<{ slots: { start: string; staff_id: string }[] }>(req);
        takenStart = r.slots[0].start;
        return toolUse("create_booking", {
          service_id: IDS.corte,
          staff_id: r.slots[0].staff_id,
          start: r.slots[0].start,
          customer_name: "Pedro",
        });
      },
      (req) => {
        const block = (req.messages.at(-1)!.content as ToolResultBlock[])[0];
        expect(block.is_error).toBe(true);
        expect(JSON.parse(block.content).error).toBe("slot_taken");
        return say("Ese horario se acaba de ocupar, ¿te sirve otro?");
      },
    ]);
    // Someone else grabs the first free slot right before the bot books it.
    const original = llm.create.bind(llm);
    llm.create = async (req, signal) => {
      const res = await original(req, signal);
      const use = res.content.find(
        (b) => b.type === "tool_use" && (b as { name: string }).name === "create_booking",
      );
      if (use) {
        await db.query(
          "select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Rival', '+573009990000', 'web')",
          [IDS.corte, IDS.staffAndres, takenStart],
        );
      }
      return res;
    };
    const res = await handleInbound(
      { channel: "simulator", from: phone(3), text: "DONPEPE corte con Andrés" },
      { store, llm, provider },
    );
    expect(res.reply).toMatch(/ocupar/);
    expect(await bookingsOf(phone(3))).toHaveLength(0);
  });

  it("stops after 5 tool calls in one turn", async () => {
    const steps: Step[] = Array.from({ length: 6 }, () => () => toolUse("list_services", {}));
    steps.push((req) => {
      const block = (req.messages.at(-1)!.content as ToolResultBlock[])[0];
      expect(block.is_error).toBe(true);
      expect(block.content).toMatch(/limit/);
      return say("Estos son nuestros servicios.");
    });
    const res = await handleInbound(
      { channel: "simulator", from: phone(4), text: "DONPEPE servicios" },
      { store, llm: scripted(steps), provider },
    );
    expect(res.toolCalls).toHaveLength(5);
  });

  it("apologizes and hands off to a human when the model fails", async () => {
    const llm: LlmClient = { create: async () => Promise.reject(new Error("overloaded")) };
    const res = await handleInbound(
      { channel: "simulator", from: phone(5), text: "DONPEPE hola" },
      { store, llm, provider },
    );
    expect(res.reply).toBe(APOLOGY);
    const conv = await db.query<{ handoff_to_human: boolean }>(
      "select handoff_to_human from conversations where id = $1",
      [res.conversationId],
    );
    expect(conv.rows[0].handoff_to_human).toBe(true);
    // While handed off, the bot stays quiet.
    const again = await handleInbound(
      { channel: "simulator", from: phone(5), text: "¿hola?" },
      { store, llm, provider },
    );
    expect(again.status).toBe("handoff_active");
  });

  it("asks for the business when there is no code, and matches by name", async () => {
    const noLlm: LlmClient = {
      create: async () => Promise.reject(new Error("should not be called")),
    };
    const first = await handleInbound(
      {
        channel: "whatsapp",
        from: phone(6),
        text: "Hola, quiero una cita",
        providerMessageId: "wamid.1",
      },
      { store, llm: noLlm, provider },
    );
    expect(first.status).toBe("needs_business");
    expect(first.reply).toMatch(/código/);
    const llm = scripted([() => say("¡Hola! Bienvenido a la Clínica Dental Sonrisa.")]);
    const second = await handleInbound(
      {
        channel: "whatsapp",
        from: phone(6),
        text: "Clínica Dental Sonrisa",
        providerMessageId: "wamid.2",
      },
      { store, llm, provider },
    );
    expect(second.status).toBe("replied");
    expect(llm.requests[0].system).toContain("Clínica Dental Sonrisa");
  });

  it("ignores duplicated provider message ids and rate-limits floods", async () => {
    const llm = scripted([() => say("ok")]);
    await handleInbound(
      { channel: "whatsapp", from: phone(7), text: "DONPEPE hola", providerMessageId: "wamid.dup" },
      { store, llm, provider },
    );
    const dup = await handleInbound(
      { channel: "whatsapp", from: phone(7), text: "DONPEPE hola", providerMessageId: "wamid.dup" },
      { store, llm, provider },
    );
    expect(dup.status).toBe("duplicate");

    const conv = await store.findConversation(phone(7), "whatsapp", IDS.donPepe);
    await db.query(
      "insert into messages (conversation_id, business_id, direction, role, content) select $1, $2, 'in', 'user', 'spam' from generate_series(1, $3)",
      [conv!.id, IDS.donPepe, RATE_LIMIT_PER_HOUR],
    );
    const limited = await handleInbound(
      { channel: "whatsapp", from: phone(7), text: "DONPEPE otra vez" },
      { store, llm, provider },
    );
    expect(limited.status).toBe("rate_limited");
  });
});
