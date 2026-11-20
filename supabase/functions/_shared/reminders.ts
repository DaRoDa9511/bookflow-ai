// Sends due reminders (24 h / 2 h before) through the active provider.
// WhatsApp: approved template "booking_reminder" (works outside the 24 h window).
// Simulator: the template is rendered as text into the customer's conversation.
import type { SqlStore } from "./agent/store.ts";
import { TEMPLATES, type MessagingProvider } from "./messaging/provider.ts";
import { formatInZone } from "./time.ts";

export interface ReminderRunResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function processDueReminders(
  store: SqlStore,
  provider: MessagingProvider,
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { sent: 0, failed: 0, skipped: 0 };
  await store.skipStaleReminders();
  const due = await store.dueReminders(100);

  for (const r of due) {
    const id = String(r.id);
    if (r.opted_in_whatsapp === false) {
      await store.markReminder(id, "skipped", "opted_out");
      result.skipped++;
      continue;
    }
    const phone = String(r.phone);
    const when = formatInZone(new Date(r.starts_at as string), String(r.timezone), "es", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const params = [
      String(r.customer_name ?? "").split(" ")[0] || "👋",
      String(r.service_name),
      `${when} con ${r.staff_name}`,
      String(r.business_name),
    ];
    try {
      const channel = provider.name;
      const businessId = String(r.business_id);
      const conversation =
        (await store.findConversation(phone, channel, businessId, 3650)) ??
        (await store.createConversation(phone, channel, businessId));
      await provider.sendTemplate(phone, "booking_reminder", params);
      await store.addMessage(conversation, {
        role: "assistant",
        direction: "out",
        content: TEMPLATES.booking_reminder(params),
        tool_name: "reminder",
        tool_payload: { template: "booking_reminder", kind: r.kind, booking_id: r.booking_id },
      });
      await store.markReminder(id, "sent");
      result.sent++;
    } catch (e) {
      await store.markReminder(id, "failed", (e as Error).message.slice(0, 300));
      result.failed++;
    }
  }
  return result;
}
