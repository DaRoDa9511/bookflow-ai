// Deno-only wiring for Edge Functions: Postgres connection, Claude client and the
// messaging provider, all configured from environment variables / secrets.
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { anthropicLlm } from "../agent/anthropic.ts";
import { SqlStore, type Sql } from "../agent/store.ts";
import type { LlmClient } from "../agent/types.ts";
import { providerFromEnv, type MessagingProvider } from "../messaging/provider.ts";

const env = (k: string) => Deno.env.get(k);

let pg: ReturnType<typeof postgres> | null = null;
function sql(): Sql {
  if (!pg) {
    const url = env("SUPABASE_DB_URL");
    if (!url) throw new Error("SUPABASE_DB_URL is not available");
    pg = postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
  }
  const conn = pg;
  return async (text, params = []) =>
    (await conn.unsafe(text, params as never[])) as unknown as Record<string, unknown>[];
}

/** Raw SQL access (service-level) for small internal lookups. */
export function sqlClient(): Sql {
  return sql();
}

export function store(): SqlStore {
  return new SqlStore(sql());
}

export function llm(): LlmClient {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return {
      create: () => Promise.reject(new Error("ANTHROPIC_API_KEY is not set")),
    };
  }
  return anthropicLlm({
    apiKey,
    model: env("CLAUDE_MODEL"),
    fallbacks: env("CLAUDE_FALLBACKS") !== "off",
  });
}

export function provider(): MessagingProvider {
  return providerFromEnv(env);
}

/** Supabase client acting as the caller (RLS applies). */
export function userClient(authHeader: string) {
  return createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

/** Checks that the caller (JWT) owns the business. */
export async function assertOwner(authHeader: string | null, businessId: string): Promise<string> {
  if (!authHeader) throw new Error("forbidden");
  const client = userClient(authHeader);
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("forbidden");
  const { data, error } = await client.rpc("is_owner", { bid: businessId });
  if (error || data !== true) throw new Error("forbidden");
  return user.user.id;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Runs work after the response is sent (Meta expects a fast 200). */
export function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error("[background]", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(guarded);
}
