// Called every 5 minutes by pg_cron (public.invoke_send_reminders) with the
// x-cron-secret header. Deploy with verify_jwt = false.
// The expected secret is CRON_SECRET, or the Vault secret "cron_secret" if unset.
import { errorJson, json } from "../_shared/http.ts";
import { processDueReminders } from "../_shared/reminders.ts";
import { provider, sqlClient, store } from "../_shared/runtime/deno.ts";

let cached: string | null = null;
async function expectedSecret(): Promise<string | null> {
  if (Deno.env.get("CRON_SECRET")) return Deno.env.get("CRON_SECRET")!;
  if (!cached) {
    const rows = await sqlClient()(
      "select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1",
    );
    cached = (rows[0]?.decrypted_secret as string | undefined) ?? null;
  }
  return cached;
}

Deno.serve(async (req) => {
  const secret = await expectedSecret();
  if (!secret || req.headers.get("x-cron-secret") !== secret) return errorJson("forbidden", 403);
  try {
    const result = await processDueReminders(store(), provider());
    return json(result);
  } catch (e) {
    console.error("[send-reminders]", e);
    return errorJson("internal_error", 500);
  }
});
