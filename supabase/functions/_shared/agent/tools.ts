// Tool definitions (JSON schema for Claude, strict) + Zod validation + executors.
import { z } from "zod";
import { computeSlotsForRange, pickSuggestions } from "../availability.ts";
import { addDays, formatInZone, localDate } from "../time.ts";
import { openingHours } from "./prompt.ts";
import type { SqlStore } from "./store.ts";
import { AgentError, type BusinessContext, type ToolDefinition } from "./types.ts";

const obj = (
  properties: Record<string, unknown>,
  required: string[] = Object.keys(properties),
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const nullableStr = (description: string) => ({ type: ["string", "null"], description });

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_business_info",
    description:
      "Business details: address, phone, opening hours, cancellation policy and knowledge base.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "list_services",
    description: "Active services with id, duration in minutes and price.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "list_staff",
    description: "Active staff members and which services each one performs.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "find_available_slots",
    description:
      "Up to 6 free appointment times for a service, optionally with a specific staff member, between two dates (max 7 days). Dates are YYYY-MM-DD in the business timezone.",
    input_schema: obj({
      service_id: str("Service id from list_services"),
      staff_id: nullableStr("Staff id from list_staff, or null for anyone available"),
      date_from: str("First date, YYYY-MM-DD"),
      date_to: nullableStr("Last date, YYYY-MM-DD, or null for a single day"),
      preferred_time: nullableStr(
        "Optional preference like 'morning', 'afternoon', 'evening' or 'HH:MM'",
      ),
    }),
    strict: true,
  },
  {
    name: "create_booking",
    description:
      "Books an appointment. Only call after the customer explicitly confirmed service, staff, date and time. The slot is re-validated.",
    input_schema: obj({
      service_id: str("Service id"),
      staff_id: str("Staff id of the chosen slot"),
      start: str("Slot start exactly as returned by find_available_slots (ISO 8601)"),
      customer_name: str("Customer full name"),
    }),
    strict: true,
  },
  {
    name: "list_my_bookings",
    description: "Upcoming appointments of the current customer (this phone) at this business.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "reschedule_booking",
    description:
      "Moves one of the customer's appointments to another free slot after they confirmed it.",
    input_schema: obj({
      booking_id: str("Booking id from list_my_bookings"),
      new_start: str("New start exactly as returned by find_available_slots (ISO 8601)"),
      staff_id: nullableStr("Staff id of the new slot, or null to keep the same professional"),
    }),
    strict: true,
  },
  {
    name: "cancel_booking",
    description: "Cancels one of the customer's appointments, respecting the cancellation policy.",
    input_schema: obj({
      booking_id: str("Booking id from list_my_bookings"),
      reason: nullableStr("Reason given by the customer, or null"),
    }),
    strict: true,
  },
  {
    name: "confirm_attendance",
    description:
      "Records that the customer confirms they will attend an upcoming appointment (e.g. they replied 'Confirmar' to a reminder). Use booking_id from list_my_bookings, or null for their next appointment.",
    input_schema: obj({
      booking_id: nullableStr("Booking id from list_my_bookings, or null for the next appointment"),
    }),
    strict: true,
  },
  {
    name: "handoff_to_human",
    description:
      "Flags the conversation so a person from the business replies. Use for complaints, medical questions, emergencies or anything you can't solve.",
    input_schema: obj({ reason: str("Short reason for the team") }),
    strict: true,
  },
];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "invalid datetime");

export const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_business_info: z.object({}).passthrough(),
  list_services: z.object({}).passthrough(),
  list_staff: z.object({}).passthrough(),
  find_available_slots: z.object({
    service_id: z.string().min(1),
    staff_id: z.string().min(1).nullable().optional(),
    date_from: date,
    date_to: date.nullable().optional(),
    preferred_time: z.string().nullable().optional(),
  }),
  create_booking: z.object({
    service_id: z.string().min(1),
    staff_id: z.string().min(1),
    start: iso,
    customer_name: z.string().min(2).max(80),
  }),
  list_my_bookings: z.object({}).passthrough(),
  reschedule_booking: z.object({
    booking_id: z.string().min(1),
    new_start: iso,
    staff_id: z.string().min(1).nullable().optional(),
  }),
  cancel_booking: z.object({
    booking_id: z.string().min(1),
    reason: z.string().nullable().optional(),
  }),
  confirm_attendance: z.object({ booking_id: z.string().min(1).nullable().optional() }),
  handoff_to_human: z.object({ reason: z.string().min(1) }),
};

export interface ToolContext {
  store: SqlStore;
  ctx: BusinessContext;
  phone: string;
  conversationId: string;
  now: Date;
  /** Set to true when the conversation was handed off during this turn. */
  handoff?: boolean;
}

function inPreferredWindow(localHHMM: string, pref?: string | null): boolean {
  if (!pref) return true;
  const p = pref.toLowerCase();
  if (/^\d{1,2}:\d{2}$/.test(p)) return true; // ranking handled by sorting
  if (/(morning|mañana)/.test(p)) return localHHMM < "12:00";
  if (/(afternoon|tarde)/.test(p)) return localHHMM >= "12:00" && localHHMM < "18:00";
  if (/(evening|noche)/.test(p)) return localHHMM >= "17:00";
  return true;
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  tc: ToolContext,
): Promise<unknown> {
  const schema = TOOL_SCHEMAS[name];
  if (!schema) throw new AgentError("unknown_tool", `Unknown tool ${name}`);
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success)
    throw new AgentError("invalid_input", parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  const { ctx, store } = tc;
  const b = ctx.business;
  const tz = b.timezone;
  const fmt = (isoStr: string) =>
    formatInZone(isoStr, tz, "es", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  const staffName = (id: string) => ctx.staff.find((s) => s.id === id)?.display_name ?? "";
  const serviceName = (id: string) => ctx.services.find((s) => s.id === id)?.name ?? "";

  switch (name) {
    case "get_business_info":
      return {
        name: b.name,
        address: b.address,
        phone: b.phone,
        timezone: tz,
        booking_code: b.booking_code,
        cancellation_hours: b.cancellation_hours,
        opening_hours: ctx.hours.length ? openingHours(ctx) : "not configured",
        knowledge_base: ctx.knowledge,
      };

    case "list_services":
      return ctx.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration_min: s.duration_min,
        price: `${s.price} ${b.currency}`,
        description: s.description,
      }));

    case "list_staff":
      return ctx.staff.map((s) => ({
        id: s.id,
        name: s.display_name,
        bio: s.bio,
        services: s.service_ids.map(serviceName).filter(Boolean),
      }));

    case "find_available_slots": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["find_available_slots"]>;
      if (!ctx.services.some((s) => s.id === i.service_id))
        throw new AgentError("service_not_found");
      const today = localDate(tc.now, tz);
      const from = i.date_from < today ? today : i.date_from;
      let to = i.date_to && i.date_to >= from ? i.date_to : from;
      if (to > addDays(from, 6)) to = addDays(from, 6);
      const avail = await store.availabilityInput(
        b.slug,
        i.service_id,
        i.staff_id ?? null,
        from,
        to,
      );
      let slots = computeSlotsForRange(
        { ...avail, now: tc.now, minLeadMinutes: 60, stepMin: 15 },
        from,
        to,
      );
      const local = (s: { start: string }) =>
        formatInZone(s.start, tz, "sv-SE", { hour: "2-digit", minute: "2-digit" });
      const windowed = slots.filter((s) => inPreferredWindow(local(s), i.preferred_time));
      if (windowed.length) slots = windowed;
      if (i.preferred_time && /^\d{1,2}:\d{2}$/.test(i.preferred_time)) {
        const target = i.preferred_time.padStart(5, "0");
        const exact = slots.filter((s) => local(s) === target);
        if (exact.length) slots = [...exact, ...slots.filter((s) => local(s) !== target)];
        else
          slots = [...slots].sort(
            (a, c) => Math.abs(cmp(local(a), target)) - Math.abs(cmp(local(c), target)),
          );
      }
      const picks = pickSuggestions(slots, 6);
      return {
        service: serviceName(i.service_id),
        searched: { from, to },
        slots: picks.map((s) => ({
          start: s.start,
          local_time: fmt(s.start),
          staff_id: s.staff_id,
          staff_name: staffName(s.staff_id),
        })),
        note: picks.length === 0 ? "No free times in this range. Suggest other dates." : undefined,
      };
    }

    case "create_booking": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["create_booking"]>;
      const r = await store.createBooking({
        slug: b.slug,
        serviceId: i.service_id,
        staffId: i.staff_id,
        start: new Date(i.start).toISOString(),
        name: i.customer_name,
        phone: tc.phone,
      });
      return {
        status: "confirmed",
        booking_id: r.booking_id,
        service: serviceName(i.service_id),
        staff: staffName(i.staff_id),
        local_time: fmt(r.starts_at),
        price: `${r.price} ${b.currency}`,
      };
    }

    case "list_my_bookings": {
      const rows = await store.customerBookings(b.id, tc.phone);
      return rows.map((r) => ({
        booking_id: r.id,
        service: r.service_name,
        service_id: r.service_id,
        staff: r.staff_name,
        staff_id: r.staff_id,
        local_time: fmt(r.starts_at),
        start: r.starts_at,
        attendance_confirmed: Boolean(r.customer_confirmed_at),
      }));
    }

    case "reschedule_booking": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["reschedule_booking"]>;
      const mine = await store.customerBookings(b.id, tc.phone);
      const booking = mine.find((x) => x.id === i.booking_id);
      if (!booking) throw new AgentError("booking_not_found");
      const hoursLeft = (Date.parse(booking.starts_at) - tc.now.getTime()) / 3_600_000;
      if (hoursLeft < b.cancellation_hours) throw new AgentError("cancellation_window");
      const r = await store.reschedule(
        i.booking_id,
        new Date(i.new_start).toISOString(),
        i.staff_id ?? null,
      );
      return {
        status: "rescheduled",
        booking_id: i.booking_id,
        local_time: fmt(r.starts_at),
        staff: staffName(r.staff_id),
      };
    }

    case "cancel_booking": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["cancel_booking"]>;
      const mine = await store.customerBookings(b.id, tc.phone);
      if (!mine.some((x) => x.id === i.booking_id)) throw new AgentError("booking_not_found");
      await store.cancel(i.booking_id, i.reason ?? "cancelled_by_customer");
      return { status: "cancelled", booking_id: i.booking_id };
    }

    case "confirm_attendance": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["confirm_attendance"]>;
      const mine = await store.customerBookings(b.id, tc.phone);
      const booking = i.booking_id ? mine.find((x) => x.id === i.booking_id) : mine[0];
      if (!booking) throw new AgentError("booking_not_found");
      await store.confirmAttendance(booking.id);
      return {
        status: "attendance_confirmed",
        booking_id: booking.id,
        service: booking.service_name,
        staff: booking.staff_name,
        local_time: fmt(booking.starts_at),
      };
    }

    case "handoff_to_human": {
      const i = input as z.infer<(typeof TOOL_SCHEMAS)["handoff_to_human"]>;
      await store.setHandoff(tc.conversationId, true, i.reason);
      tc.handoff = true;
      return { status: "handed_off", message: "A team member will reply in this chat." };
    }
  }
  throw new AgentError("unknown_tool");
}

function cmp(a: string, b: string): number {
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  return m(a) - m(b);
}

/** Human-readable explanation for tool errors, returned to the model as is_error results. */
export const TOOL_ERROR_HINTS: Record<string, string> = {
  slot_taken:
    "That time was just taken by someone else. Offer other times from find_available_slots.",
  too_soon: "Appointments must be at least 1 hour from now.",
  outside_working_hours: "That time is outside working hours for that professional.",
  time_off: "The business or professional is off at that time.",
  staff_cannot_do_service: "That professional doesn't perform this service.",
  service_not_found: "Unknown service id. Call list_services.",
  cancellation_window:
    "Too late: the cancellation policy window has passed. Offer handoff_to_human if needed.",
  booking_not_found: "That booking doesn't belong to this customer. Call list_my_bookings.",
  booking_not_active: "That booking is no longer active.",
  invalid_name: "A valid customer name is required.",
  invalid_input: "The tool input was invalid.",
};
