// Transactional email via Resend. Without RESEND_API_KEY the email is skipped
// (logged) so the rest of the flow keeps working in development.
export interface EmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  input: EmailInput,
  env: { apiKey?: string; from?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: boolean; reason?: string }> {
  if (!env.apiKey) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${input.to} subject=${input.subject}`);
    return { sent: false, reason: "not_configured" };
  }
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.from ?? "BookFlow AI <onboarding@resend.dev>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[email failed] ${res.status} ${text}`);
    return { sent: false, reason: `http_${res.status}` };
  }
  return { sent: true };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function approvalEmail(p: {
  ownerName?: string | null;
  businessName: string;
  bookingCode: string;
  appUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `¡${p.businessName} ya está en BookFlow AI!`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#111">
      <h2 style="color:#4f46e5">¡Bienvenido${p.ownerName ? `, ${esc(p.ownerName)}` : ""}!</h2>
      <p>Aprobamos la solicitud de <strong>${esc(p.businessName)}</strong>. Tu código de reservas es
      <strong style="font-size:18px">${esc(p.bookingCode)}</strong>.</p>
      <p>Completa la configuración en 4 pasos (servicios, personal, horarios y asistente) y obtén tu enlace de WhatsApp y QR:</p>
      <p><a href="${esc(p.appUrl)}/app/onboarding" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Configurar mi negocio</a></p>
      <p style="color:#666;font-size:12px">BookFlow AI · Reservas 24/7 por WhatsApp</p></div>`,
  };
}

export function rejectionEmail(p: {
  ownerName?: string | null;
  businessName: string;
  note?: string | null;
}) {
  return {
    subject: `Tu solicitud de ${p.businessName} en BookFlow AI`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#111">
      <p>Hola${p.ownerName ? ` ${esc(p.ownerName)}` : ""}, revisamos la solicitud de <strong>${esc(p.businessName)}</strong> y por ahora no pudimos aprobarla.</p>
      ${p.note ? `<p><em>${esc(p.note)}</em></p>` : ""}
      <p>Puedes corregir los datos y enviarla de nuevo desde tu cuenta.</p></div>`,
  };
}
