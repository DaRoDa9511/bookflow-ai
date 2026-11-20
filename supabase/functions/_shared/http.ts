// HTTP helpers shared by every Edge Function.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

/** Extracts our SQL error codes ("slot_taken", "forbidden", …) from a PostgREST error. */
export function sqlErrorCode(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "unknown_error";
  return msg.match(/[a-z]+(_[a-z]+)+/)?.[0] ?? msg;
}
