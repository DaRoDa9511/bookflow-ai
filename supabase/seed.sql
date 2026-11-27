-- BookFlow AI · demo data
-- Demo password for every account: BookFlow2026!  (demo-only credentials, see README)
-- Accounts: admin@bookflow.demo (super admin), owner@donpepe.demo, barbero@donpepe.demo,
--           owner@sonrisa.demo, solicitud@spazen.demo (pending application)

set search_path = public, extensions;

-- ───────────── auth users ─────────────
with u(id, email, full_name) as (
  values
    ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin@bookflow.demo', 'Admin BookFlow'),
    ('00000000-0000-0000-0000-00000000a002'::uuid, 'owner@donpepe.demo', 'Pepe Ramírez'),
    ('00000000-0000-0000-0000-00000000a003'::uuid, 'barbero@donpepe.demo', 'Carlos Mejía'),
    ('00000000-0000-0000-0000-00000000a004'::uuid, 'owner@sonrisa.demo', 'Laura Gómez'),
    ('00000000-0000-0000-0000-00000000a005'::uuid, 'solicitud@spazen.demo', 'Valentina Ruiz')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  crypt('BookFlow2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from u
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users
where id in (
  '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
  '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a004',
  '00000000-0000-0000-0000-00000000a005'
)
and not exists (select 1 from auth.identities i where i.user_id = auth.users.id);

update public.profiles set is_super_admin = true where id = '00000000-0000-0000-0000-00000000a001';

-- ───────────── businesses ─────────────
insert into public.businesses (
  id, slug, name, category, city, timezone, currency, phone, address, booking_code,
  cancellation_hours, reminder_hours, bot_tone, onboarding_completed
) values
  ('11111111-1111-1111-1111-111111111111', 'barberia-don-pepe', 'Barbería Don Pepe', 'barbershop',
   'Bogotá', 'America/Bogota', 'COP', '+573001112233', 'Calle 85 #15-20, Bogotá', 'DONPEPE',
   3, '{24,2}', 'friendly', true),
  ('22222222-2222-2222-2222-222222222222', 'clinica-dental-sonrisa', 'Clínica Dental Sonrisa', 'clinic',
   'Ciudad de México', 'America/Mexico_City', 'MXN', '+525511223344', 'Av. Insurgentes Sur 1200, CDMX', 'SONRISA',
   24, '{24,2}', 'professional', true)
on conflict (id) do nothing;

insert into public.staff (id, business_id, display_name, bio, color) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pepe', 'Fundador, 20 años de oficio.', '#f97316'),
  ('b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Carlos', 'Especialista en fades y diseño.', '#0ea5e9'),
  ('b1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Andrés', 'Barba y afeitado clásico.', '#22c55e'),
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Dra. Laura Gómez', 'Odontología general y estética.', '#8b5cf6'),
  ('b2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Dr. Miguel Torres', 'Ortodoncia.', '#ec4899'),
  ('b2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Sofía Herrera', 'Higienista dental.', '#14b8a6')
on conflict (id) do nothing;

insert into public.memberships (business_id, user_id, role, staff_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000a002', 'owner', 'b1000000-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000a003', 'staff', 'b1000000-0000-0000-0000-000000000002'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000a004', 'owner', 'b2000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.services (id, business_id, name, description, duration_min, price, buffer_min) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte clásico', 'Corte con tijera y máquina.', 30, 30000, 0),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Corte + barba', 'Corte completo y arreglo de barba.', 60, 50000, 0),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Fade / degradado', 'Degradado a navaja.', 45, 40000, 0),
  ('c1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Arreglo de barba', 'Perfilado y toalla caliente.', 30, 25000, 0),
  ('c1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Corte niño', 'Menores de 12 años.', 30, 22000, 0),
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Limpieza dental', 'Profilaxis y revisión.', 45, 800, 15),
  ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Consulta general', 'Valoración y diagnóstico.', 30, 500, 0),
  ('c2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Blanqueamiento', 'Blanqueamiento en consultorio.', 60, 3500, 15),
  ('c2000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Resina', 'Restauración estética.', 60, 1200, 0),
  ('c2000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Valoración de ortodoncia', 'Primera visita de ortodoncia.', 30, 600, 0)
on conflict (id) do nothing;

-- Every barber does every service; at the clinic, cleanings are done by the hygienist
-- and orthodontics by Dr. Torres.
insert into public.staff_services (business_id, staff_id, service_id)
select s.business_id, st.id, s.id
from public.services s
join public.staff st on st.business_id = s.business_id
where s.business_id = '11111111-1111-1111-1111-111111111111'
   or (st.id = 'b2000000-0000-0000-0000-000000000001' and s.id in (
        'c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000004'))
   or (st.id = 'b2000000-0000-0000-0000-000000000002' and s.id in (
        'c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000005'))
   or (st.id = 'b2000000-0000-0000-0000-000000000003' and s.id in (
        'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002'))
on conflict do nothing;

-- Working hours: barbershop Mon–Fri 9–19, Sat 9–14; clinic Mon–Fri 8–17.
insert into public.working_hours (business_id, staff_id, weekday, start_time, end_time)
select st.business_id, st.id, wd,
       case when st.business_id = '11111111-1111-1111-1111-111111111111' then '09:00'::time else '08:00'::time end,
       case when st.business_id = '22222222-2222-2222-2222-222222222222' then '17:00'::time
            when wd = 6 then '14:00'::time else '19:00'::time end
from public.staff st
cross join generate_series(1, 6) wd
where not exists (select 1 from public.working_hours w where w.staff_id = st.id)
  and (st.business_id = '11111111-1111-1111-1111-111111111111' or wd between 1 and 5);

-- ───────────── customers ─────────────
insert into public.customers (business_id, phone, name)
select '11111111-1111-1111-1111-111111111111', '+5730012345' || lpad(i::text, 2, '0'),
       (array['Juan Pérez','Mateo Díaz','Santiago López','Sebastián Rojas','Nicolás Vargas','Daniel Castro','Felipe Moreno','Camilo Ortiz'])[i]
from generate_series(1, 8) i
on conflict do nothing;

insert into public.customers (business_id, phone, name)
select '22222222-2222-2222-2222-222222222222', '+5255123456' || lpad(i::text, 2, '0'),
       (array['María Fernández','Ana Martínez','Lucía Sánchez','Sofía Ramírez','Valeria Cruz','Jorge Navarro','Ricardo Silva','Paula Medina'])[i]
from generate_series(1, 8) i
on conflict do nothing;

-- ───────────── 40 bookings: last two weeks and next two weeks ─────────────
do $$
declare
  biz record;
  i int;
  d date;
  v_staff uuid[];
  v_services uuid[];
  v_customers uuid[];
  v_hours int[];
  v_service public.services;
  v_start timestamptz;
  v_status public.booking_status;
  v_sources public.booking_source[] := array['whatsapp', 'web', 'whatsapp', 'admin']::public.booking_source[];
begin
  if exists (select 1 from public.bookings where business_id in (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')) then
    return;
  end if;

  for biz in select * from public.businesses where id in (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') order by slug
  loop
    select array_agg(id order by id) into v_staff from public.staff where business_id = biz.id;
    select array_agg(id order by id) into v_customers from public.customers where business_id = biz.id;
    v_hours := case when biz.category = 'clinic' then array[8, 10, 12, 14, 15] else array[9, 11, 13, 15, 17] end;

    for i in 0..19 loop
      d := current_date + (-14 + floor(i * 1.4))::int;
      if extract(dow from d) = 0 then d := d + 1; end if;
      if biz.category = 'clinic' and extract(dow from d) = 6 then d := d + 2; end if;

      -- Pick a service this staff member can perform.
      select s.* into v_service from public.services s
      join public.staff_services ss on ss.service_id = s.id and ss.staff_id = v_staff[1 + i % 3]
      order by s.id offset (i % 2) limit 1;
      if not found then
        select s.* into v_service from public.services s
        join public.staff_services ss on ss.service_id = s.id and ss.staff_id = v_staff[1 + i % 3]
        order by s.id limit 1;
      end if;

      v_start := (d::timestamp + make_interval(hours => v_hours[1 + i % 5])) at time zone biz.timezone;
      v_status := case
        when v_start > now() then 'confirmed'
        when i % 7 = 0 then 'no_show'
        when i % 9 = 0 then 'cancelled'
        else 'completed' end;

      insert into public.bookings (
        business_id, customer_id, staff_id, service_id, starts_at, ends_at,
        status, source, price, created_at
      ) values (
        biz.id, v_customers[1 + i % 8], v_staff[1 + i % 3], v_service.id, v_start,
        v_start + make_interval(mins => v_service.duration_min),
        v_status, v_sources[1 + i % 4], v_service.price,
        least(now(), v_start - interval '3 days')
      );
    end loop;
  end loop;
end;
$$;

-- ───────────── knowledge base ─────────────
insert into public.knowledge_base (business_id, title, content)
select * from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Ubicación y parqueadero',
   'Estamos en la Calle 85 #15-20, Bogotá, a media cuadra del parque. Hay parqueadero público en la esquina (gratis la primera hora con tu tiquete).'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Pagos',
   'Aceptamos efectivo, Nequi, Daviplata y tarjetas. No se requiere anticipo.'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Política de cancelación',
   'Puedes cancelar o reprogramar sin costo hasta 3 horas antes de tu cita. Si llegas más de 10 minutos tarde podríamos reprogramarte.'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Ubicación',
   'Av. Insurgentes Sur 1200, piso 3, consultorio 301, CDMX. Estacionamiento con valet en el edificio.'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Seguros y pagos',
   'Aceptamos tarjetas, transferencia y efectivo. Trabajamos con reembolso de GNP y AXA; pide tu factura en recepción.'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Política de cancelación',
   'Cancela o reprograma con al menos 24 horas de anticipación. Para urgencias dentales llama al +52 55 1122 3344.')
) v(business_id, title, content)
where not exists (select 1 from public.knowledge_base);

-- ───────────── demo conversation (simulator) ─────────────
insert into public.conversations (id, business_id, customer_id, phone, channel, state, last_message_at)
select 'd1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', c.id, c.phone, 'simulator',
       '{"business_id":"11111111-1111-1111-1111-111111111111"}'::jsonb, now() - interval '2 hours'
from public.customers c
where c.business_id = '11111111-1111-1111-1111-111111111111' and c.phone = '+573001234501'
on conflict (id) do nothing;

insert into public.messages (conversation_id, business_id, direction, role, content, created_at)
select 'd1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', v.direction::public.message_direction,
       v.role::public.message_role, v.content, now() - v.ago
from (values
  ('in', 'user', 'Hola DONPEPE, ¿tienen parqueadero?', interval '125 minutes'),
  ('out', 'assistant', '¡Hola! 👋 Sí: hay parqueadero público en la esquina, gratis la primera hora con tu tiquete. ¿Te ayudo a agendar una cita?', interval '124 minutes')
) v(direction, role, content, ago)
where exists (select 1 from public.conversations where id = 'd1000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.messages where conversation_id = 'd1000000-0000-0000-0000-000000000001');

-- ───────────── pending application ─────────────
insert into public.business_applications (user_id, business_name, category, city, phone, timezone)
select '00000000-0000-0000-0000-00000000a005', 'Spa Zen', 'spa', 'Medellín', '+573005556677', 'America/Bogota'
where not exists (
  select 1 from public.business_applications where user_id = '00000000-0000-0000-0000-00000000a005'
);

-- Demo bookings are historical data: no "booking confirmation" messages for them.
delete from public.reminders where kind = 'confirmation';
