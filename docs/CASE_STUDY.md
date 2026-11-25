# Case study: BookFlow AI

## The problem

Small appointment-based businesses (barbershops, beauty salons, dental clinics, spas) live on WhatsApp. Customers message at night, during a haircut or while the receptionist is on the phone. Every unanswered message is a lost booking, and every forgotten appointment is an empty chair. Owners told us the same three things:

- Bookings are lost because nobody answers fast enough.
- No-shows cost them 10–20% of the week.
- Generic booking apps force customers to install something or create an account, and they don't.

## The solution

BookFlow AI puts an AI receptionist on WhatsApp, the channel customers already use, backed by a real scheduling system:

1. The business shares a `wa.me` link or a QR code containing its booking code (e.g. `Hola DONPEPE`).
2. An AI agent (Claude with tool use) answers questions from the business's own knowledge base, checks **real** availability, and books, reschedules or cancels, always confirming service, professional, day and time first.
3. The appointment appears instantly in the owner's live calendar, and the customer gets WhatsApp reminders 24 h and 2 h before.

The platform is multi-tenant: owners apply, a super admin approves, and a 4-step onboarding (services → staff → hours → knowledge base) gets them live in minutes. Staff see only their own agenda. Customers can also book on a public web page or review their appointments with a phone OTP, with no account needed.

## Stack

- **Frontend:** React 18, Vite, TypeScript (strict), Tailwind with shadcn/ui-style components, TanStack Query, React Hook Form + Zod, FullCalendar, Recharts, i18next (ES/EN), dark mode.
- **Backend:** Supabase: Postgres with row-level security, Auth (email + phone OTP), Realtime, Storage, Edge Functions (Deno), pg_cron + pg_net.
- **AI:** LLM with tool use (9 tools, Zod-validated) behind a provider interface: Google Gemini (free tier) for the public demo, Claude as a drop-in alternative.
- **Messaging:** WhatsApp Cloud API behind a provider interface, plus a built-in simulator.
- **Quality:** Vitest (55 tests), PGlite, Playwright, ESLint, Prettier, GitHub Actions.

## Key technical decisions

**The agent can't hallucinate a time slot.** The model never sees a calendar it could misread: it calls `find_available_slots`, which runs the shared availability engine, and it can only book through `create_booking`, which goes through a SQL function that revalidates the slot inside the transaction. A Postgres exclusion constraint (`btree_gist` over `staff_id` + `tstzrange`) makes double booking physically impossible, even when two customers grab the same slot at the same second. The test suite simulates exactly that race.

**One availability engine, three consumers.** Slot computation (working hours, split shifts, service duration + buffer, time off, existing bookings, business timezone with DST, minimum lead time) lives in a single dependency-free TypeScript module used by the Edge Functions, the public booking page and the dashboard. The public page gets only the _inputs_ from an RPC (never customer data) and computes slots in the browser with the same code the agent uses.

**Security in the database, not in the UI.** Every table carries `business_id`, and RLS policies built on `is_owner`, `is_member` and `my_staff_id` isolate tenants. Staff can only edit their own appointments, anonymous users only reach three whitelisted RPCs, and users can't promote themselves (column-level grants). RLS has its own tests: one owner can't read another business's data.

**Testing the real database without Docker.** Migrations, seed, RLS and RPCs run in CI on PGlite (Postgres compiled to WASM) with a minimal Supabase `auth` stub. The agent's data layer is written against a tiny SQL interface, so the same code runs on postgres.js in production and on PGlite in tests. The agent tests exercise the full pipeline (business routing → mocked Claude → tools → real SQL RPCs) for FAQ, booking, rescheduling, cancelling, full days, races, tool limits and model failures.

**Built to fail gracefully.** Max 5 tool calls per turn, a 25-second turn budget, 30 messages per hour per phone, idempotency on WhatsApp message ids, and a fast 200 to Meta with processing in the background. Any model error becomes an apology plus a human handoff, visible as a flag in the inbox where the owner can take over the chat.

**Demo-able without Meta approval.** WhatsApp sits behind a `MessagingProvider` interface. The default `simulator` provider runs the exact same agent pipeline from a WhatsApp-style phone inside the dashboard, so a prospect can chat with the bot and watch the booking land in the calendar in under two minutes. Switching to the real Cloud API is a single environment variable.

## Results

- End-to-end booking flow (message → availability → confirmation → calendar) with live updates.
- 55 automated tests: availability edge cases (DST, buffers, split shifts), RLS isolation, booking RPCs, agent scenarios with mocked Claude, reminders and WhatsApp signature verification.
- Multi-tenant onboarding without touching the database: apply → approve → configure → share QR.
- Bilingual (ES/EN), responsive from 360 px, light and dark themes.

## What's next

Stripe deposits for high-value services (the schema already models `pending_payment` with a 15-minute expiry), a dedicated WhatsApp number per business, and multi-location support.
