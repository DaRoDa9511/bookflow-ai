import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/helpers/db.ts";
import { SqlStore } from "./agent/store.ts";
import { SimulatorProvider, WhatsAppCloudProvider } from "./messaging/provider.ts";
import { processDueReminders } from "./reminders.ts";

let db: PGlite;
let store: SqlStore;

beforeAll(async () => {
  db = await createTestDb();
  store = new SqlStore(
    async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[],
  );
});

describe("reminders", () => {
  it("every future confirmed booking gets 24h and 2h reminders from the trigger", async () => {
    const { rows } = await db.query<{ kinds: string }>(
      `select string_agg(r.kind, ',' order by r.kind) kinds from bookings b
       join reminders r on r.booking_id = b.id
       where b.status = 'confirmed' and b.starts_at > now() + interval '1 day'
       group by b.id limit 1`,
    );
    expect(rows[0].kinds).toBe("24h,2h");
  });

  it("sends due reminders through the simulator and stores them in the conversation", async () => {
    await db.query("update reminders set send_at = now() - interval '1 minute' where kind = '24h'");
    const due = (
      await db.query<{ n: number }>(
        "select count(*)::int n from reminders where status = 'scheduled' and send_at <= now()",
      )
    ).rows[0].n;
    expect(due).toBeGreaterThan(0);

    const result = await processDueReminders(store, new SimulatorProvider());
    expect(result.sent).toBe(due);
    const msgs = await db.query<{ content: string }>(
      "select content from messages where tool_name = 'reminder'",
    );
    expect(msgs.rows).toHaveLength(due);
    expect(msgs.rows[0].content).toMatch(/Te recordamos tu cita/);
    // Idempotent: nothing left to send.
    expect((await processDueReminders(store, new SimulatorProvider())).sent).toBe(0);
  });

  it("uses the WhatsApp template and records failures", async () => {
    await db.query(
      "update reminders set send_at = now() - interval '1 minute' where kind = '2h' and status = 'scheduled'",
    );
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return calls === 1
        ? new Response(JSON.stringify({ messages: [{ id: "wamid.r" }] }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: "template not approved" } }), {
            status: 400,
          });
    });
    const wa = new WhatsAppCloudProvider(
      { token: "t", phoneNumberId: "1", verifyToken: "v", appSecret: "s" },
      fetchMock as unknown as typeof fetch,
    );
    const result = await processDueReminders(store, wa);
    expect(result.sent).toBe(1);
    expect(result.failed).toBeGreaterThan(0);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.template.name).toBe("booking_reminder");
    const failed = await db.query<{ error: string }>(
      "select error from reminders where status = 'failed' limit 1",
    );
    expect(failed.rows[0].error).toMatch(/template not approved/);
  });

  it("skips reminders of cancelled bookings and expires unpaid bookings", async () => {
    const { rows } = await db.query<{ id: string }>(
      "select b.id from bookings b join reminders r on r.booking_id = b.id where r.status = 'scheduled' limit 1",
    );
    if (rows[0]) {
      await db.query("update bookings set status = 'cancelled' where id = $1", [rows[0].id]);
      const left = await db.query(
        "select 1 from reminders where booking_id = $1 and status = 'scheduled'",
        [rows[0].id],
      );
      expect(left.rows).toHaveLength(0);
    }
    await db.query(
      `update bookings set status = 'pending_payment', created_at = now() - interval '20 minutes'
       where id = (select id from bookings where status = 'confirmed' and starts_at > now() limit 1)`,
    );
    const [{ n }] = (await db.query<{ n: number }>("select public.expire_pending_payments() n"))
      .rows;
    expect(n).toBe(1);
  });
});
