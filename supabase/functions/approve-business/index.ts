// POST { application_id, action: "approve" | "reject", note? }
// Runs the approval RPC with the caller's JWT (so is_super_admin() is enforced in
// SQL), then sends the welcome / rejection email with Resend.
import { createClient } from "@supabase/supabase-js";
import { approvalEmail, rejectionEmail, sendEmail } from "../_shared/email.ts";
import { errorJson, json, preflight, sqlErrorCode } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("method_not_allowed", 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return errorJson("forbidden", 401);

  let body: { application_id?: string; action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json");
  }
  if (!body.application_id || !["approve", "reject"].includes(body.action ?? "")) {
    return errorJson("invalid_input");
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });

  const fn = body.action === "approve" ? "approve_application" : "reject_application";
  const { data, error } = await supabase.rpc(fn, {
    p_application_id: body.application_id,
    p_note: body.note ?? null,
  });
  if (error) {
    const code = sqlErrorCode(error);
    return errorJson(code, code === "forbidden" ? 403 : 400);
  }

  const result = data as {
    business_name: string;
    owner_email: string | null;
    owner_name: string | null;
    booking_code?: string;
    slug?: string;
  };
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
  let email = { sent: false, reason: "no_recipient" } as { sent: boolean; reason?: string };
  if (result.owner_email) {
    const content =
      body.action === "approve"
        ? approvalEmail({
            ownerName: result.owner_name,
            businessName: result.business_name,
            bookingCode: result.booking_code ?? "",
            appUrl,
          })
        : rejectionEmail({
            ownerName: result.owner_name,
            businessName: result.business_name,
            note: body.note,
          });
    email = await sendEmail(
      { to: result.owner_email, ...content },
      { apiKey: Deno.env.get("RESEND_API_KEY"), from: Deno.env.get("EMAIL_FROM") },
    );
  }

  return json({ ...result, email });
});
