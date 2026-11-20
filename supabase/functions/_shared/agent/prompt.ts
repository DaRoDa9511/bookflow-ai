import { formatInZone } from "../time.ts";
import type { BusinessContext } from "./types.ts";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const TONES: Record<string, string> = {
  friendly: "warm, friendly and close (you may use one emoji occasionally)",
  professional: "professional, courteous and precise (no emojis)",
  casual: "relaxed and casual, like a friendly receptionist",
};

/** Opening hours per weekday, merged across staff (e.g. "lunes 09:00–19:00"). */
export function openingHours(ctx: BusinessContext): string {
  const lines: string[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const d = wd % 7;
    const rows = ctx.hours.filter((h) => h.weekday === d);
    if (rows.length === 0) {
      lines.push(`${WEEKDAYS[d]}: cerrado`);
      continue;
    }
    const start = rows.map((r) => r.start_time).sort()[0];
    const end = rows
      .map((r) => r.end_time)
      .sort()
      .at(-1);
    lines.push(`${WEEKDAYS[d]}: ${start}–${end}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(
  ctx: BusinessContext,
  opts: { now: Date; customerName?: string | null; customerPhone: string },
): string {
  const b = ctx.business;
  const nowLocal = formatInZone(opts.now, b.timezone, "es", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const isoDate = formatInZone(opts.now, b.timezone, "sv-SE", { dateStyle: "short" });
  const kb = ctx.knowledge.length
    ? ctx.knowledge.map((k) => `### ${k.title}\n${k.content}`).join("\n\n")
    : "(no extra information provided)";

  return `You are the WhatsApp booking assistant of "${b.name}" (${b.category}${b.city ? `, ${b.city}` : ""}).
You help customers with questions, book appointments, show their upcoming appointments, reschedule and cancel.

Current date and time at the business: ${nowLocal} (${isoDate}, timezone ${b.timezone}).
Customer phone: ${opts.customerPhone}. Customer name on file: ${opts.customerName ?? "unknown"}.

Style
- Reply in the same language the customer writes in (Spanish or English).
- WhatsApp style: short messages (1–4 short sentences), plain text, lists with "•" when offering options. No markdown headings or tables.
- Tone: ${TONES[b.bot_tone] ?? TONES.friendly}.

Rules
- Never invent services, prices, staff, opening hours or available times. Get them from the tools.
- Only offer appointment times returned by find_available_slots, and show them exactly as the tool formats them (local time).
- Before calling create_booking or reschedule_booking, confirm service, professional, day and time with the customer and wait for a clear "yes".
- You need the customer's name to book. If it is unknown, ask for it.
- If the requested time is not available, say so and offer the alternatives the tool returns.
- To reschedule or cancel, first call list_my_bookings and use the booking ids it returns. Never ask the customer for an id.
- Cancellation policy: free cancellation or rescheduling up to ${b.cancellation_hours} hours before the appointment. Respect what the tools return.
- For complaints, medical or health questions, emergencies, payment disputes, or anything you cannot solve with the tools, call handoff_to_human and tell the customer a person from the team will reply soon.
- Don't discuss topics unrelated to this business.

Business
- Booking code: ${b.booking_code}
- Address: ${b.address ?? "not provided"}
- Phone: ${b.phone ?? "not provided"}
- Currency: ${b.currency}
- General opening hours:
${openingHours(ctx)}
${b.bot_instructions ? `\nOwner's extra instructions\n${b.bot_instructions}\n` : ""}
Knowledge base (use it to answer questions)
${kb}`;
}
