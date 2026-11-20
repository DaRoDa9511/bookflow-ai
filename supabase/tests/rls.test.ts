import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, localDate, weekdayOf, zonedToUtc } from "../functions/_shared/time.ts";
import { as, createTestDb, IDS } from "./helpers/db.ts";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});

/** Next weekday (Mon–Fri) local date in Bogotá at least `minDays` ahead. */
function nextWeekday(minDays = 3): string {
  let d = addDays(localDate(new Date(), "America/Bogota"), minDays);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
  return d;
}
const at = (date: string, hour: number) => zonedToUtc(date, hour * 60, "America/Bogota").toISOString();

describe("seed", () => {
  it("creates the demo data described in the plan", async () => {
    const [counts] = (
      await db.query<{ biz: number; staff: number; services: number; bookings: number; pending: number }>(`
      select (select count(*)::int from businesses) biz, (select count(*)::int from staff) staff,
             (select count(*)::int from services) services, (select count(*)::int from bookings) bookings,
             (select count(*)::int from business_applications where status = 'pending') pending`)
    ).rows;
    expect(counts).toEqual({ biz: 2, staff: 6, services: 10, bookings: 40, pending: 1 });
  });

  it("creates reminders for future confirmed bookings", async () => {
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int n from reminders r join bookings b on b.id = r.booking_id where b.status = 'confirmed'",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("RLS isolation", () => {
  it("an owner cannot read another business's data", async () => {
    await as(db, { role: "authenticated", sub: IDS.ownerDonPepe }, async (q) => {
      const biz = await q<{ id: string }>("select id from businesses");
      expect(biz.map((b) => b.id)).toEqual([IDS.donPepe]);
      const foreign = await q(
        "select 1 from bookings where business_id = $1 union all select 1 from customers where business_id = $1 union all select 1 from services where business_id = $1",
        [IDS.sonrisa],
      );
      expect(foreign).toHaveLength(0);
      const own = await q("select 1 from bookings where business_id = $1", [IDS.donPepe]);
      expect(own).toHaveLength(20);
    });
  });

  it("an owner cannot write into another business", async () => {
    await as(db, { role: "authenticated", sub: IDS.ownerDonPepe }, async (q) => {
      await expect(
        q("insert into services (business_id, name, duration_min, price) values ($1, 'x', 30, 1)", [IDS.sonrisa]),
      ).rejects.toThrow(/row-level security/);
      const updated = await q("update businesses set name = 'hacked' where id = $1 returning id", [IDS.sonrisa]);
      expect(updated).toHaveLength(0);
    });
  });

  it("staff only see and edit their own appointments", async () => {
    await as(db, { role: "authenticated", sub: IDS.barbero }, async (q) => {
      const rows = await q<{ staff_id: string }>("select staff_id from bookings");
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.staff_id))).toEqual(new Set([IDS.staffCarlos]));
      const others = await q("update bookings set notes = 'x' where staff_id <> $1 returning id", [IDS.staffCarlos]);
      expect(others).toHaveLength(0);
      const mine = await q("update bookings set notes = 'ok' where staff_id = $1 returning id", [IDS.staffCarlos]);
      expect(mine.length).toBeGreaterThan(0);
      await expect(q("insert into services (business_id, name, duration_min) values ($1, 'x', 30)", [IDS.donPepe])).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it("anonymous users cannot read customers or bookings", async () => {
    await as(db, { role: "anon" }, async (q) => {
      await expect(q("select * from customers")).rejects.toThrow(/permission denied/);
      await expect(q("select * from bookings")).rejects.toThrow(/permission denied/);
    });
  });

  it("users cannot promote themselves to super admin", async () => {
    await as(db, { role: "authenticated", sub: IDS.ownerDonPepe }, async (q) => {
      await expect(q("update profiles set is_super_admin = true where id = $1", [IDS.ownerDonPepe])).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("the super admin reads everything", async () => {
    await as(db, { role: "authenticated", sub: IDS.admin }, async (q) => {
      expect(await q("select id from businesses")).toHaveLength(2);
      expect(await q("select id from bookings")).toHaveLength(40);
    });
  });
});

describe("public booking RPCs", () => {
  it("exposes the public business profile and availability context to anon", async () => {
    await as(db, { role: "anon" }, async (q) => {
      const [{ data }] = await q<{ data: { business: { name: string }; services: unknown[]; staff: unknown[] } }>(
        "select get_public_business('barberia-don-pepe') data",
      );
      expect(data.business.name).toBe("Barbería Don Pepe");
      expect(data.services).toHaveLength(5);
      expect(data.staff).toHaveLength(3);
      const day = nextWeekday();
      const [{ ctx }] = await q<{ ctx: { staff_ids: string[]; working_hours: unknown[] } }>(
        "select get_availability_context('barberia-don-pepe', $1, null, $2::date, $2::date) ctx",
        [IDS.corte, day],
      );
      expect(ctx.staff_ids).toHaveLength(3);
      expect(ctx.working_hours.length).toBeGreaterThan(0);
    });
  });

  it("creates a booking and rejects a second one for the same slot", async () => {
    const day = nextWeekday(4);
    await as(db, { role: "anon" }, async (q) => {
      const [{ r }] = await q<{ r: { status: string } }>(
        "select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Ana Test', '+573009998877') r",
        [IDS.corte, IDS.staffAndres, at(day, 10)],
      );
      expect(r.status).toBe("confirmed");
      await expect(
        q("select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Otro', '+573009998866')", [
          IDS.corte,
          IDS.staffAndres,
          at(day, 10),
        ]),
      ).rejects.toThrow(/slot_taken/);
    });
  });

  it("validates hours, lead time and phone format", async () => {
    const day = nextWeekday(5);
    await as(db, { role: "anon" }, async (q) => {
      const call = (start: string, phone = "+573009998877") =>
        q("select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Ana', $4)", [IDS.corte, IDS.staffAndres, start, phone]);
      await expect(call(at(day, 6))).rejects.toThrow(/outside_working_hours/);
      await expect(call(new Date(Date.now() + 10 * 60_000).toISOString())).rejects.toThrow(/too_soon|outside_working_hours/);
      await expect(call(at(day, 11), "3001234")).rejects.toThrow(/invalid_phone/);
    });
  });

  it("the exclusion constraint blocks overlapping writes even without the RPC", async () => {
    const day = nextWeekday(6);
    await as(db, { role: "service_role" }, async (q) => {
      const insert = (from: number, to: number) =>
        q(
          `insert into bookings (business_id, customer_id, staff_id, service_id, starts_at, ends_at, status)
           select $1, id, $2, $3, $4, $5, 'confirmed' from customers where business_id = $1 limit 1`,
          [IDS.donPepe, IDS.staffPepe, IDS.corte, at(day, from), at(day, to)],
        );
      await insert(12, 13);
      await expect(insert(12.5, 13.5)).rejects.toThrow(/bookings_no_overlap/);
      await insert(13, 14); // touching intervals are fine
    });
  });

  it("reschedules and cancels respecting permissions and the cancellation window", async () => {
    const day = nextWeekday(7);
    await as(db, { role: "service_role" }, async (q) => {
      const [{ r }] = await q<{ r: { booking_id: string } }>(
        "select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Bot', '+573001110000', 'whatsapp') r",
        [IDS.corte, IDS.staffPepe, at(day, 15)],
      );
      const [{ source }] = await q<{ source: string }>("select source from bookings where id = $1", [r.booking_id]);
      expect(source).toBe("whatsapp");
      await q("select reschedule_booking($1, $2)", [r.booking_id, at(day, 16)]);
      const reminders = await q<{ kind: string }>("select kind from reminders where booking_id = $1 order by kind", [r.booking_id]);
      expect(reminders.map((x) => x.kind)).toEqual(["24h", "2h"]);
      await q("select cancel_booking($1, 'test')", [r.booking_id]);
      const left = await q("select 1 from reminders where booking_id = $1 and status = 'scheduled'", [r.booking_id]);
      expect(left).toHaveLength(0);
    });
    const { rows } = await db.query<{ id: string }>(
      "select id from public.bookings where business_id = $1 and status = 'confirmed' limit 1",
      [IDS.donPepe],
    );
    await as(db, { role: "authenticated", sub: IDS.ownerSonrisa }, async (q) => {
      await expect(q("select cancel_booking($1)", [rows[0].id])).rejects.toThrow(/forbidden/);
    });
  });

  it("anon cannot spoof the whatsapp source", async () => {
    const day = nextWeekday(8);
    await as(db, { role: "anon" }, async (q) => {
      const [{ r }] = await q<{ r: { booking_id: string } }>(
        "select create_public_booking('barberia-don-pepe', $1, $2, $3, 'Anon', '+573001110001', 'whatsapp') r",
        [IDS.corte, IDS.staffAndres, at(day, 18)],
      );
      await db.exec("reset role");
      const rows = await q<{ source: string }>("select source from bookings where id = $1", [r.booking_id]);
      expect(rows).toEqual([{ source: "web" }]);
    });
  });
});

describe("business onboarding", () => {
  it("super admin approves an application: business, slug, code and owner membership", async () => {
    await as(db, { role: "authenticated", sub: IDS.admin }, async (q) => {
      const [{ id }] = await q<{ id: string }>("select id from business_applications where status = 'pending'");
      const [{ r }] = await q<{ r: { slug: string; booking_code: string; business_id: string; owner_email: string } }>(
        "select approve_application($1, 'Bienvenidos') r",
        [id],
      );
      expect(r.slug).toBe("spa-zen");
      expect(r.booking_code).toBe("SPAZEN");
      expect(r.owner_email).toBe("solicitud@spazen.demo");
      const m = await q<{ role: string }>("select role from memberships where business_id = $1", [r.business_id]);
      expect(m).toEqual([{ role: "owner" }]);
    });
  });

  it("non admins cannot approve applications", async () => {
    const { rows } = await db.query<{ id: string }>("select id from business_applications where status = 'pending'");
    await as(db, { role: "authenticated", sub: IDS.ownerDonPepe }, async (q) => {
      await expect(q("select approve_application($1)", [rows[0].id])).rejects.toThrow(/forbidden/);
    });
  });

  it("applicants can only file applications for themselves", async () => {
    await as(db, { role: "authenticated", sub: IDS.barbero }, async (q) => {
      await expect(
        q(
          "insert into business_applications (user_id, business_name, category, city, phone, timezone) values ($1, 'X', 'spa', 'C', '+573000000000', 'America/Bogota')",
          [IDS.applicant],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("owners get metrics, staff invitations work", async () => {
    await as(db, { role: "authenticated", sub: IDS.ownerDonPepe }, async (q) => {
      const [{ m }] = await q<{ m: { series: unknown[] } }>("select business_metrics($1) m", [IDS.donPepe]);
      expect(m.series).toHaveLength(30);
      const [{ r }] = await q<{ r: { status: string } }>("select invite_staff($1, 'nuevo@donpepe.demo', $2) r", [
        IDS.donPepe,
        IDS.staffAndres,
      ]);
      expect(r.status).toBe("invited");
    });
    await as(db, { role: "authenticated", sub: IDS.barbero }, async (q) => {
      await expect(q("select business_metrics($1)", [IDS.donPepe])).rejects.toThrow(/forbidden/);
    });
  });
});
