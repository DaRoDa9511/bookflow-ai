# BookFlow AI — Plan de implementación

> Copia en Markdown del plan original (PDF, 20 nov 2026). Las desviaciones están en [DECISIONS.md](DECISIONS.md).

## Visión

BookFlow AI permite que barberías, salones, clínicas y spas reciban reservas 24/7 por WhatsApp: un agente de IA responde dudas, revisa disponibilidad real, agenda, recuerda y reprograma citas. Es multi-negocio: cada negocio solicita acceso, el super admin lo aprueba y obtiene su propio panel.

| Rol           | Quién                  | Puede                                                                                                                                          |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin` | Dueño de la plataforma | Aprobar o rechazar solicitudes, suspender negocios, ver métricas globales                                                                      |
| `owner`       | Dueño del negocio      | Configurar negocio, servicios, personal, horarios, políticas y base de conocimiento; ver reservas, clientes y conversaciones; invitar personal |
| `staff`       | Barbero, dentista      | Ver y gestionar solo su agenda; marcar citas como completadas o no asistió                                                                     |
| Cliente       | Persona que reserva    | Reservar por WhatsApp o por la página pública sin cuenta; opcionalmente entrar con OTP para ver su historial                                   |

El cliente se identifica por su teléfono (E.164). Los roles por negocio viven en `memberships`.

**Alta de un negocio:** registro (email + contraseña) → solicitud (nombre, tipo, ciudad, teléfono, zona horaria) → `pending` → el super admin aprueba (se crea el `business` con slug, `membership` owner, email de bienvenida) → onboarding de 4 pasos (servicios, personal, horarios, base de conocimiento) → enlace `wa.me` y QR.

**Fuera de alcance v1:** número de WhatsApp propio por negocio, app móvil nativa, facturación del SaaS, multi-sucursal.

## Stack

| Capa       | Tecnología                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | React 18 + Vite + TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, FullCalendar, Recharts, i18next (ES/EN) |
| Backend    | Supabase: PostgreSQL + RLS, Auth (email y OTP por teléfono), Realtime, Storage, Edge Functions (Deno), `pg_cron` + `pg_net`                     |
| IA         | Claude API con tool use; base de conocimiento inyectada en el prompt (sin vectores en v1)                                                       |
| Mensajería | WhatsApp Cloud API detrás de `MessagingProvider`; proveedor `simulator` por defecto                                                             |
| Pagos      | Stripe Checkout en modo test para depósitos opcionales (**pospuesto**, ver DECISIONS)                                                           |
| Email      | Resend                                                                                                                                          |
| Deploy     | Vercel (web) + Supabase Cloud                                                                                                                   |
| Calidad    | ESLint, Prettier, Vitest, Playwright, GitHub Actions                                                                                            |

Fechas en UTC (`timestamptz`), mostradas en la zona horaria del negocio. La lógica de disponibilidad vive en `supabase/functions/_shared/availability.ts`, compartida por bot, página pública y panel.

## Modelo de datos

`profiles`, `business_applications`, `businesses`, `memberships`, `staff`, `services`, `staff_services`, `working_hours`, `time_off`, `customers`, `bookings`, `conversations`, `messages`, `knowledge_base`, `reminders`, `audit_log` (ver `supabase/migrations`).

Restricciones: sin citas solapadas por staff (exclusión `btree_gist` sobre `(staff_id, tstzrange)` para `confirmed`/`pending_payment`); `pending_payment` caduca a los 15 min; trigger que crea/recalcula `reminders`.

RLS con helpers `is_super_admin()`, `is_member(bid)`, `is_owner(bid)`, `my_staff_id(bid)`:
super admin lectura total; owner CRUD en su negocio; staff lectura de su negocio y escritura solo en sus citas y su `time_off`; cliente OTP lee sus reservas y cancela según política; anónimo usa RPCs públicas.

## Agente de IA y WhatsApp

Herramientas: `get_business_info`, `list_services`, `list_staff`, `find_available_slots`, `create_booking`, `list_my_bookings`, `reschedule_booking`, `cancel_booking`, `handoff_to_human`.
El agente nunca inventa horarios ni precios; confirma servicio + staff + fecha + hora antes de reservar; deriva a humano ante quejas o temas médicos; responde en el idioma del cliente. Historial: 20 mensajes. Límites: 30 mensajes/teléfono/hora, 5 llamadas de herramienta por turno, timeout de 25 s; error del modelo → disculpa + handoff.

Identificación del negocio con un solo número: `wa.me/<numero>?text=Hola%20<BOOKING_CODE>` → código válido fija el negocio; si no, última conversación activa (< 30 días); si no, el bot pide el código o nombre.

`MessagingProvider { sendText, sendTemplate, verifyWebhook, parseIncoming }` con `SimulatorProvider` (default) y `WhatsAppCloudProvider` (`MESSAGING_PROVIDER=whatsapp`). Idempotencia por `provider_message_id`; responder 200 a Meta de inmediato. Plantillas `booking_reminder` y `booking_confirmation`.

## Pantallas

`/` landing · `/b/:slug` página pública con reserva en 4 pasos · `/login`, `/signup`, `/apply`, `/apply/status` · `/admin` · `/app` dashboard · `/app/calendar` · `/app/bookings` · `/app/customers` · `/app/inbox` · `/app/simulator` · `/app/services`, `/app/staff`, `/app/hours` · `/app/assistant` · `/app/settings` · `/me` (cliente OTP).

Modo claro/oscuro, ES/EN, responsive desde 360 px, estados vacíos, skeletons, toasts y confirmación antes de cancelar.

## Fases

| Fase                             | Tag    | Contenido                                                                                            |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| 0 — Base                         | v0.1.0 | Monorepo, TS estricto, Tailwind, shadcn/ui, ESLint, Prettier, Vitest, CI, docs                       |
| 1 — Datos, auth y roles          | v0.2.0 | Migraciones, RLS, anti-solape, recordatorios, auth, guardas por rol, seed, tests RLS                 |
| 2 — Alta y super admin           | v0.3.0 | `/apply`, `/admin`, `approve-business`, onboarding de 4 pasos                                        |
| 3 — Panel del negocio            | v0.4.0 | CRUD, agenda en vivo, reservas, clientes, dashboard, vista staff                                     |
| 4 — Disponibilidad y reserva web | v0.5.0 | `availability.ts` con tests, RPCs públicas, `/b/:slug`, `/me`                                        |
| 5 — Agente + simulador           | v0.6.0 | Agente con tool use, proveedores de mensajería, simulador e inbox en vivo, tests con Claude mockeado |
| 6 — Recordatorios y pagos        | v0.7.0 | `send-reminders` con pg_cron, caducidad de `pending_payment` (Stripe pospuesto)                      |
| 7 — Pulido y despliegue          | v1.0.0 | Landing, i18n, modo oscuro, E2E, deploy, README, CASE_STUDY                                          |

## Criterios de terminado

- Un cliente de Upwork abre el demo, chatea con el bot y ve la cita en la agenda en menos de 2 minutos.
- Un usuario nuevo solicita su negocio, el super admin lo aprueba y el owner completa el onboarding sin tocar la base de datos.
- En el simulador el bot reserva, reprograma y cancela en español y en inglés; la agenda se actualiza en vivo.
- Dos clientes no pueden tomar el mismo horario del mismo staff.
- Un owner no puede leer datos de otro negocio (tests RLS en verde).
- Recordatorios de 24 h y 2 h generados y enviados por el proveedor activo.
- CI en verde, E2E pasando, Lighthouse ≥ 90 en la landing.
- Cuentas demo: `admin@bookflow.demo`, `owner@donpepe.demo`, `barbero@donpepe.demo`.
- README en inglés y `docs/CASE_STUDY.md` en inglés.

## Pasos manuales (tuyos)

WhatsApp Cloud API: app Business en developers.facebook.com → `PHONE_NUMBER_ID` + token permanente (System User) → número de prueba como destinatario → webhook `https://<proyecto>.supabase.co/functions/v1/whatsapp-webhook` con `WHATSAPP_VERIFY_TOKEN`, campo `messages` → plantillas `booking_reminder` y `booking_confirmation` (Utility) → secretos `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `MESSAGING_PROVIDER=whatsapp`.

Otras variables: `ANTHROPIC_API_KEY`, `RESEND_API_KEY` (secretos de Supabase), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Vercel), `APP_URL` (ambos).
