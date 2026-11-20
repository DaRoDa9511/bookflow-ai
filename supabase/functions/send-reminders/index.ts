// Called every 5 minutes by pg_cron (public.invoke_send_reminders) with the
// x-cron-secret header. Deploy with verify_jwt = false.
import { errorJson, json } from "../_shared/http.ts";
import { processDueReminders } from "../_shared/reminders.ts";
import { provider, store } from "../_shared/runtime/deno.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return errorJson("forbidden", 403);
  try {
    const result = await processDueReminders(store(), provider());
    return json(result);
  } catch (e) {
    console.error("[send-reminders]", e);
    return errorJson("internal_error", 500);
  }
});
