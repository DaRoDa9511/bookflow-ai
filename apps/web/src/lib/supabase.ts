import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !anonKey.includes("placeholder"));

// Typed rows live in src/types/models.ts. Regenerate full DB types with
// `supabase gen types typescript --project-id <ref> > src/types/database.ts`.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "public-anon-key",
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);

export const functionsUrl = `${url ?? "http://localhost:54321"}/functions/v1`;

/** Calls an Edge Function with the current user's JWT. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as object });
  if (error) {
    let message = error.message;
    const status = (error as { context?: Response }).context?.status;
    if (status === 401 || status === 403) {
      // Expired or revoked session: sign out locally so the guard sends the user to /login.
      const { error: userError } = await supabase.auth.getUser();
      if (userError) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("session_expired");
      }
    }
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const payload = await ctx.json();
        message = payload?.error ?? message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return data as T;
}
