// Data access for the agent, written against a tiny `Sql` function so the same
// code runs on postgres.js (Edge Functions, SUPABASE_DB_URL) and on PGlite (tests).
// It always filters by business_id explicitly and reuses the SQL RPCs, so every
// booking rule (validate_slot, exclusion constraint, cancellation window) applies.
import type { AvailabilityInput } from "../availability.ts";
import {
  AgentError,
  type BusinessContext,
  type ConversationRow,
  type CustomerBooking,
  type StoredMessage,
} from "./types.ts";

export type Row = Record<string, unknown>;
export type Sql = (text: string, params?: unknown[]) => Promise<Row[]>;

function sqlCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.match(/[a-z]+(_[a-z]+)+/)?.[0] ?? "unknown_error";
}

async function rpc<T>(sql: Sql, text: string, params: unknown[]): Promise<T> {
  try {
    const rows = await sql(text, params);
    return Object.values(rows[0] ?? {})[0] as T;
  } catch (e) {
    throw new AgentError(sqlCode(e), e instanceof Error ? e.message : String(e));
  }
}

const asJson = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

export class SqlStore {
  constructor(private sql: Sql) {}

  // ── conversations & messages ──────────────────────────────────────
  async messageExists(providerMessageId: string): Promise<boolean> {
    const rows = await this.sql(
      "select 1 from public.messages where provider_message_id = $1 limit 1",
      [providerMessageId],
    );
    return rows.length > 0;
  }

  async countInboundLastHour(phone: string): Promise<number> {
    const rows = await this.sql(
      `select count(*)::int as n from public.messages m
       join public.conversations c on c.id = m.conversation_id
       where c.phone = $1 and m.direction = 'in' and m.created_at > now() - interval '1 hour'`,
      [phone],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async findBusinessByCode(code: string): Promise<{ id: string; name: string } | null> {
    const rows = await this.sql(
      "select id, name from public.businesses where booking_code = upper($1) and status = 'active'",
      [code],
    );
    return (rows[0] as { id: string; name: string }) ?? null;
  }

  async searchBusinesses(
    text: string,
  ): Promise<{ id: string; name: string; booking_code: string }[]> {
    const q = text.trim().slice(0, 60);
    if (q.length < 3) return [];
    const rows = await this.sql(
      `select id, name, booking_code from public.businesses
       where status = 'active' and (name ilike '%' || $1 || '%' or $1 ilike '%' || name || '%')
       order by name limit 5`,
      [q],
    );
    return rows as { id: string; name: string; booking_code: string }[];
  }

  /** Latest conversation of this phone on this channel, optionally for a given business. */
  async findConversation(
    phone: string,
    channel: string,
    businessId?: string | null,
    maxAgeDays = 30,
  ): Promise<ConversationRow | null> {
    const rows = await this.sql(
      `select id, business_id, customer_id, phone, channel, handoff_to_human, state
       from public.conversations
       where phone = $1 and channel = $2
         and ($3::uuid is null or business_id = $3::uuid)
         and last_message_at > now() - make_interval(days => $4)
       order by last_message_at desc limit 1`,
      [phone, channel, businessId ?? null, maxAgeDays],
    );
    const r = rows[0];
    return r ? ({ ...r, state: asJson(r.state) } as ConversationRow) : null;
  }

  async createConversation(
    phone: string,
    channel: string,
    businessId: string | null,
  ): Promise<ConversationRow> {
    const rows = await this.sql(
      `insert into public.conversations (phone, channel, business_id, state)
       values ($1, $2::conversation_channel, $3::uuid, jsonb_build_object('business_id', $3::uuid::text))
       returning id, business_id, customer_id, phone, channel, handoff_to_human, state`,
      [phone, channel, businessId],
    );
    const r = rows[0];
    return { ...r, state: asJson(r.state) } as ConversationRow;
  }

  async attachBusiness(conversationId: string, businessId: string): Promise<void> {
    await this.sql(
      `update public.conversations
       set business_id = $2::uuid, state = state || jsonb_build_object('business_id', $2::uuid::text)
       where id = $1`,
      [conversationId, businessId],
    );
  }

  async upsertCustomer(businessId: string, phone: string, name?: string | null): Promise<string> {
    const rows = await this.sql(
      `insert into public.customers (business_id, phone, name) values ($1, $2, $3)
       on conflict (business_id, phone) do update set name = coalesce(public.customers.name, excluded.name)
       returning id`,
      [businessId, phone, name ?? null],
    );
    return String(rows[0].id);
  }

  async customerName(customerId: string): Promise<string | null> {
    const rows = await this.sql("select name from public.customers where id = $1", [customerId]);
    return (rows[0]?.name as string | null) ?? null;
  }

  async setConversationCustomer(conversationId: string, customerId: string): Promise<void> {
    await this.sql("update public.conversations set customer_id = $2 where id = $1", [
      conversationId,
      customerId,
    ]);
  }

  async addMessage(conversation: ConversationRow, m: StoredMessage): Promise<void> {
    await this.sql(
      `insert into public.messages
         (conversation_id, business_id, direction, role, content, tool_name, tool_payload, provider_message_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        conversation.id,
        conversation.business_id,
        m.direction,
        m.role,
        m.content,
        m.tool_name ?? null,
        m.tool_payload === undefined ? null : JSON.stringify(m.tool_payload),
        m.provider_message_id ?? null,
      ],
    );
    await this.sql("update public.conversations set last_message_at = now() where id = $1", [
      conversation.id,
    ]);
  }

  async history(
    conversationId: string,
    limit = 20,
  ): Promise<{ role: "user" | "assistant"; content: string }[]> {
    const rows = await this.sql(
      `select role, content from (
         select role, content, created_at from public.messages
         where conversation_id = $1 and role in ('user', 'assistant') and content <> ''
         order by created_at desc limit $2
       ) t order by created_at asc`,
      [conversationId, limit],
    );
    return rows as { role: "user" | "assistant"; content: string }[];
  }

  async setHandoff(conversationId: string, value: boolean, reason?: string): Promise<void> {
    await this.sql(
      `update public.conversations
       set handoff_to_human = $2, state = state || jsonb_build_object('handoff_reason', $3::text)
       where id = $1`,
      [conversationId, value, reason ?? null],
    );
  }

  // ── business data ─────────────────────────────────────────────────
  async businessContext(businessId: string): Promise<BusinessContext | null> {
    const b = await this.sql(
      `select id, slug, name, category::text, city, timezone, currency, phone, address, booking_code,
              cancellation_hours, bot_tone, bot_instructions, status::text
       from public.businesses where id = $1`,
      [businessId],
    );
    if (!b[0]) return null;
    const [services, staff, links, hours, kb] = await Promise.all([
      this.sql(
        `select id, name, description, duration_min, price::float8 as price from public.services
         where business_id = $1 and is_active order by price, name`,
        [businessId],
      ),
      this.sql(
        "select id, display_name, bio from public.staff where business_id = $1 and is_active order by display_name",
        [businessId],
      ),
      this.sql("select staff_id, service_id from public.staff_services where business_id = $1", [
        businessId,
      ]),
      this.sql(
        `select staff_id, weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
         from public.working_hours where business_id = $1`,
        [businessId],
      ),
      this.sql(
        "select title, content from public.knowledge_base where business_id = $1 order by created_at",
        [businessId],
      ),
    ]);
    return {
      business: b[0] as unknown as BusinessContext["business"],
      services: services as unknown as BusinessContext["services"],
      staff: staff.map((s) => ({
        ...(s as { id: string; display_name: string; bio: string | null }),
        service_ids: links.filter((l) => l.staff_id === s.id).map((l) => String(l.service_id)),
      })),
      hours: hours as unknown as BusinessContext["hours"],
      knowledge: kb as unknown as BusinessContext["knowledge"],
    };
  }

  async availabilityInput(
    slug: string,
    serviceId: string,
    staffId: string | null,
    from: string,
    to: string,
  ): Promise<Omit<AvailabilityInput, "now">> {
    const ctx = asJson<{
      timezone: string;
      duration_min: number;
      buffer_min: number;
      staff_ids: string[];
      working_hours: AvailabilityInput["workingHours"];
      time_off: AvailabilityInput["timeOff"];
      busy: AvailabilityInput["busy"];
    }>(
      await rpc(
        this.sql,
        "select public.get_availability_context($1, $2, $3, $4::date, $5::date) as r",
        [slug, serviceId, staffId, from, to],
      ),
    );
    return {
      timezone: ctx.timezone,
      durationMin: ctx.duration_min,
      bufferMin: ctx.buffer_min,
      staffIds: ctx.staff_ids,
      workingHours: ctx.working_hours,
      timeOff: ctx.time_off,
      busy: ctx.busy,
    };
  }

  // ── bookings (always through the validating RPCs) ─────────────────
  async createBooking(p: {
    slug: string;
    serviceId: string;
    staffId: string;
    start: string;
    name: string;
    phone: string;
  }): Promise<{ booking_id: string; starts_at: string; ends_at: string; price: number }> {
    return asJson(
      await rpc(
        this.sql,
        "select public.create_public_booking($1, $2, $3, $4::timestamptz, $5, $6, 'whatsapp') as r",
        [p.slug, p.serviceId, p.staffId, p.start, p.name, p.phone],
      ),
    );
  }

  async customerBookings(businessId: string, phone: string): Promise<CustomerBooking[]> {
    const rows = await this.sql(
      `select b.id, b.starts_at, b.ends_at, b.status::text, b.service_id, s.name as service_name,
              b.staff_id, st.display_name as staff_name, b.price::float8 as price
       from public.bookings b
       join public.customers c on c.id = b.customer_id
       join public.services s on s.id = b.service_id
       join public.staff st on st.id = b.staff_id
       where b.business_id = $1 and c.phone = $2
         and b.status in ('confirmed', 'pending_payment') and b.starts_at > now()
       order by b.starts_at`,
      [businessId, phone],
    );
    return rows.map((r) => ({
      ...(r as unknown as CustomerBooking),
      starts_at: new Date(r.starts_at as string).toISOString(),
      ends_at: new Date(r.ends_at as string).toISOString(),
    }));
  }

  async reschedule(bookingId: string, start: string, staffId: string | null) {
    return asJson<{ starts_at: string; staff_id: string }>(
      await rpc(this.sql, "select public.reschedule_booking($1, $2::timestamptz, $3) as r", [
        bookingId,
        start,
        staffId,
      ]),
    );
  }

  async cancel(bookingId: string, reason: string | null) {
    return asJson(
      await rpc(this.sql, "select public.cancel_booking($1, $2) as r", [bookingId, reason]),
    );
  }

  // ── reminders ─────────────────────────────────────────────────────
  async dueReminders(limit = 50) {
    return this.sql(
      `select r.id, r.kind, b.id as booking_id, b.starts_at, b.business_id, c.phone, c.name as customer_name,
              c.opted_in_whatsapp, s.name as service_name, st.display_name as staff_name,
              bz.name as business_name, bz.timezone, bz.address
       from public.reminders r
       join public.bookings b on b.id = r.booking_id
       join public.customers c on c.id = b.customer_id
       join public.services s on s.id = b.service_id
       join public.staff st on st.id = b.staff_id
       join public.businesses bz on bz.id = b.business_id
       where r.status = 'scheduled' and r.send_at <= now() and b.status = 'confirmed' and b.starts_at > now()
       order by r.send_at limit $1`,
      [limit],
    );
  }

  async markReminder(id: string, status: "sent" | "failed" | "skipped", error?: string) {
    await this.sql(
      "update public.reminders set status = $2::text::public.reminder_status, sent_at = case when $2::text = 'sent' then now() end, error = $3 where id = $1",
      [id, status, error ?? null],
    );
  }

  /** Reminders whose booking is gone or already past are skipped. */
  async skipStaleReminders() {
    await this.sql(
      `update public.reminders r set status = 'skipped'
       from public.bookings b
       where b.id = r.booking_id and r.status = 'scheduled' and r.send_at <= now()
         and (b.status <> 'confirmed' or b.starts_at <= now())`,
    );
  }
}
