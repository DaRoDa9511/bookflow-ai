// Spins up an in-process Postgres (PGlite) with a minimal Supabase-compatible
// `auth` schema and roles, then applies every migration and the seed.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = resolve(__dirname, "../../..");

const AUTH_STUB = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique, phone text unique,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text
);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(AUTH_STUB);
  const dir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  try {
    await db.exec(readFileSync(join(ROOT, "supabase/seed.sql"), "utf8"));
  } catch (e) {
    throw new Error(`Seed failed: ${(e as Error).message}`);
  }
  return db;
}

export type Actor =
  | { role: "anon" }
  | { role: "authenticated"; sub: string }
  | { role: "service_role" };

/** Runs `fn` inside a transaction impersonating `actor`, then rolls back. */
export async function as<T>(
  db: PGlite,
  actor: Actor,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  await db.exec("begin");
  try {
    const claims = JSON.stringify(actor.role === "authenticated" ? { sub: actor.sub, role: actor.role } : { role: actor.role });
    await db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await db.exec(`set local role ${actor.role}`);
    // Each statement runs in a savepoint so an expected error doesn't abort the test transaction.
    const q = async <R,>(sql: string, params: unknown[] = []) => {
      await db.exec("savepoint q");
      try {
        const rows = (await db.query<R>(sql, params)).rows;
        await db.exec("release savepoint q");
        return rows;
      } catch (e) {
        await db.exec("rollback to savepoint q");
        throw e;
      }
    };
    return await fn(q);
  } finally {
    await db.exec("rollback");
  }
}

export const IDS = {
  admin: "00000000-0000-0000-0000-00000000a001",
  ownerDonPepe: "00000000-0000-0000-0000-00000000a002",
  barbero: "00000000-0000-0000-0000-00000000a003",
  ownerSonrisa: "00000000-0000-0000-0000-00000000a004",
  applicant: "00000000-0000-0000-0000-00000000a005",
  donPepe: "11111111-1111-1111-1111-111111111111",
  sonrisa: "22222222-2222-2222-2222-222222222222",
  staffPepe: "b1000000-0000-0000-0000-000000000001",
  staffCarlos: "b1000000-0000-0000-0000-000000000002",
  staffAndres: "b1000000-0000-0000-0000-000000000003",
  corte: "c1000000-0000-0000-0000-000000000001",
};
