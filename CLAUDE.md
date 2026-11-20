# BookFlow AI

Multi-business booking SaaS with a WhatsApp AI agent. Full plan: `docs/PLAN.md`; deviations: `docs/DECISIONS.md`.

## Stack

- `apps/web`: React 18 + Vite + TS (strict), Tailwind + shadcn-style components in `src/components/ui`, React Router, TanStack Query, RHF + Zod, FullCalendar, Recharts, i18next.
- `supabase/`: Postgres migrations (RLS everywhere), `seed.sql`, Edge Functions (Deno) in `supabase/functions`.
- `supabase/functions/_shared`: dependency-light TS shared by Edge Functions **and** the web app (`@shared/*` alias): `time.ts`, `availability.ts`, `agent/`, `messaging/`. Imports inside `_shared` use explicit `.ts` extensions so Deno, Vite and Vitest all resolve them.

## Commands

- `npm run dev` — web app (needs `apps/web/.env.local`, see `.env.example`)
- `npm test` — Vitest: availability, agent (mocked Claude), and DB tests (migrations + seed + RLS on PGlite)
- `npm run lint` / `npm run typecheck` / `npm run format`
- `npm run e2e` — Playwright (needs a running app + Supabase)

## Conventions

- Dates stored as UTC `timestamptz`; display in the business timezone (`formatInZone`).
- Never put keys in code; everything comes from env vars (`.env.example`).
- Server-side rules live in SQL (`validate_slot`, RPCs); slot listing lives in `availability.ts`.
- Edge Functions use the service role and always filter by `business_id` explicitly.
- Conventional Commits; tag each phase (`v0.1.0` … `v1.0.0`).
