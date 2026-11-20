-- BookFlow AI · RPCs (server-side validation for bookings, onboarding, metrics)

-- ───────────────────────── utils ─────────────────────────
create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(txt, '')), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- Validates that a slot is bookable and returns its end time. The listing of
-- slots lives in supabase/functions/_shared/availability.ts; this function
-- enforces the same rules inside the transaction that writes the booking.
create or replace function public.validate_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_exclude_booking uuid default null,
  p_enforce_lead boolean default true
) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses;
  s public.services;
  v_end timestamptz;
  v_local timestamp;
  v_local_end timestamp;
begin
  select * into b from public.businesses where id = p_business_id;
  if not found or b.status <> 'active' then
    raise exception 'business_unavailable';
  end if;

  select * into s from public.services
  where id = p_service_id and business_id = p_business_id and is_active;
  if not found then
    raise exception 'service_not_found';
  end if;

  if not exists (
    select 1 from public.staff st
    join public.staff_services ss on ss.staff_id = st.id
    where st.id = p_staff_id and st.business_id = p_business_id and st.is_active
      and ss.service_id = p_service_id
  ) then
    raise exception 'staff_cannot_do_service';
  end if;

  if p_enforce_lead and p_starts_at < now() + interval '1 hour' then
    raise exception 'too_soon';
  end if;

  v_end := p_starts_at + make_interval(mins => s.duration_min);
  v_local := p_starts_at at time zone b.timezone;
  v_local_end := v_end at time zone b.timezone;

  if not exists (
    select 1 from public.working_hours w
    where w.staff_id = p_staff_id
      and w.weekday = extract(dow from v_local)::int
      and w.start_time <= v_local::time
      and v_local_end::date = v_local::date
      and v_local_end::time <= w.end_time
  ) then
    raise exception 'outside_working_hours';
  end if;

  if exists (
    select 1 from public.time_off t
    where t.business_id = p_business_id
      and (t.staff_id is null or t.staff_id = p_staff_id)
      and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_starts_at, v_end, '[)')
  ) then
    raise exception 'time_off';
  end if;

  if exists (
    select 1 from public.bookings x
    where x.staff_id = p_staff_id
      and x.status in ('confirmed', 'pending_payment')
      and (p_exclude_booking is null or x.id <> p_exclude_booking)
      and tstzrange(x.starts_at, x.ends_at, '[)')
          && tstzrange(p_starts_at, v_end + make_interval(mins => s.buffer_min), '[)')
  ) then
    raise exception 'slot_taken';
  end if;

  return v_end;
end;
$$;
revoke execute on function public.validate_slot(uuid, uuid, uuid, timestamptz, uuid, boolean)
  from public, anon, authenticated;

-- ───────────────────────── public (anon) ─────────────────────────
create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'city', b.city,
      'timezone', b.timezone, 'currency', b.currency, 'phone', b.phone, 'address', b.address,
      'logo_url', b.logo_url, 'booking_code', b.booking_code,
      'cancellation_hours', b.cancellation_hours
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'duration_min', s.duration_min, 'price', s.price
      ) order by s.price, s.name)
      from public.services s where s.business_id = b.id and s.is_active
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'display_name', st.display_name, 'bio', st.bio,
        'avatar_url', st.avatar_url, 'color', st.color,
        'service_ids', coalesce((
          select jsonb_agg(ss.service_id) from public.staff_services ss where ss.staff_id = st.id
        ), '[]'::jsonb)
      ) order by st.display_name)
      from public.staff st where st.business_id = b.id and st.is_active
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = p_slug and b.status = 'active';
$$;

-- Everything availability.ts needs to compute slots, without customer data.
create or replace function public.get_availability_context(
  p_slug text,
  p_service_id uuid,
  p_staff_id uuid default null,
  p_from date default current_date,
  p_to date default current_date
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses;
  s public.services;
  v_staff uuid[];
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into b from public.businesses where slug = p_slug and status = 'active';
  if not found then raise exception 'business_unavailable'; end if;
  select * into s from public.services where id = p_service_id and business_id = b.id and is_active;
  if not found then raise exception 'service_not_found'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_range'; end if;

  select coalesce(array_agg(st.id), '{}') into v_staff
  from public.staff st
  join public.staff_services ss on ss.staff_id = st.id and ss.service_id = s.id
  where st.business_id = b.id and st.is_active and (p_staff_id is null or st.id = p_staff_id);

  v_from := (p_from - 1)::timestamp at time zone b.timezone;
  v_to := (p_to + 2)::timestamp at time zone b.timezone;

  return jsonb_build_object(
    'timezone', b.timezone,
    'duration_min', s.duration_min,
    'buffer_min', s.buffer_min,
    'staff_ids', to_jsonb(v_staff),
    'working_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', w.staff_id, 'weekday', w.weekday,
        'start_time', to_char(w.start_time, 'HH24:MI'), 'end_time', to_char(w.end_time, 'HH24:MI')))
      from public.working_hours w where w.staff_id = any (v_staff)
    ), '[]'::jsonb),
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', t.staff_id, 'starts_at', t.starts_at, 'ends_at', t.ends_at))
      from public.time_off t
      where t.business_id = b.id and t.ends_at > v_from and t.starts_at < v_to
    ), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', x.staff_id, 'starts_at', x.starts_at, 'ends_at', x.ends_at))
      from public.bookings x
      where x.staff_id = any (v_staff) and x.status in ('confirmed', 'pending_payment')
        and x.ends_at > v_from and x.starts_at < v_to
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_source public.booking_source default 'web',
  p_notes text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b public.businesses;
  v_end timestamptz;
  v_customer uuid;
  v_booking uuid;
  v_price numeric;
  v_source public.booking_source := p_source;
begin
  select * into b from public.businesses where slug = p_slug and status = 'active';
  if not found then raise exception 'business_unavailable'; end if;
  if p_customer_phone is null or p_customer_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'invalid_name';
  end if;
  -- Only trusted callers may set a source other than web: the bot (service role)
  -- and team members creating bookings from the panel ('admin').
  if not public.is_service_role() and not (v_source = 'admin' and public.is_member(b.id)) then
    v_source := 'web';
  end if;

  v_end := public.validate_slot(b.id, p_service_id, p_staff_id, p_starts_at, null, true);

  insert into public.customers (business_id, phone, name)
  values (b.id, p_customer_phone, trim(p_customer_name))
  on conflict (business_id, phone) do update set name = coalesce(public.customers.name, excluded.name)
  returning id into v_customer;

  select price into v_price from public.services where id = p_service_id;

  begin
    insert into public.bookings (
      business_id, customer_id, staff_id, service_id, starts_at, ends_at,
      status, source, price, deposit_status, notes
    ) values (
      b.id, v_customer, p_staff_id, p_service_id, p_starts_at, v_end,
      'confirmed', v_source, v_price, 'none', p_notes
    ) returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object(
    'booking_id', v_booking, 'customer_id', v_customer, 'status', 'confirmed',
    'starts_at', p_starts_at, 'ends_at', v_end, 'price', v_price
  );
end;
$$;

grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_availability_context(text, uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.create_public_booking(text, uuid, uuid, timestamptz, text, text, public.booking_source, text)
  to anon, authenticated;

-- ───────────────────────── booking changes ─────────────────────────
create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  bk public.bookings;
  v_staff uuid;
  v_team boolean;
  v_end timestamptz;
begin
  select * into bk from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  v_staff := coalesce(p_staff_id, bk.staff_id);
  v_team := coalesce(public.is_owner(bk.business_id)
    or (public.my_staff_id(bk.business_id) = bk.staff_id and v_staff = bk.staff_id), false);
  if not coalesce(public.is_service_role() or v_team or public.is_my_customer_record(bk.customer_id), false) then
    raise exception 'forbidden';
  end if;
  if bk.status not in ('confirmed', 'pending_payment') then
    raise exception 'booking_not_active';
  end if;

  v_end := public.validate_slot(bk.business_id, bk.service_id, v_staff, p_starts_at, bk.id, not v_team);

  begin
    update public.bookings
    set starts_at = p_starts_at, ends_at = v_end, staff_id = v_staff
    where id = bk.id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('booking_id', bk.id, 'starts_at', p_starts_at, 'ends_at', v_end, 'staff_id', v_staff);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  bk public.bookings;
  v_team boolean;
  v_hours int;
begin
  select * into bk from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  v_team := coalesce(public.is_owner(bk.business_id) or public.my_staff_id(bk.business_id) = bk.staff_id, false);
  if not coalesce(public.is_service_role() or v_team or public.is_my_customer_record(bk.customer_id), false) then
    raise exception 'forbidden';
  end if;
  if bk.status not in ('confirmed', 'pending_payment') then
    raise exception 'booking_not_active';
  end if;
  if not v_team then
    select cancellation_hours into v_hours from public.businesses where id = bk.business_id;
    if bk.starts_at - now() < make_interval(hours => v_hours) then
      raise exception 'cancellation_window';
    end if;
  end if;
  update public.bookings set status = 'cancelled', cancelled_reason = p_reason where id = bk.id;
  return jsonb_build_object('booking_id', bk.id, 'status', 'cancelled');
end;
$$;

-- Customer portal (phone OTP): link customer rows to the auth user and list bookings.
create or replace function public.my_bookings()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select '+' || ltrim(u.phone, '+') into v_phone from auth.users u
  where u.id = auth.uid() and u.phone is not null and u.phone <> '';
  if v_phone is not null then
    update public.customers set user_id = auth.uid() where phone = v_phone and user_id is null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', bk.id, 'starts_at', bk.starts_at, 'ends_at', bk.ends_at, 'status', bk.status,
      'price', bk.price, 'business_name', b.name, 'business_slug', b.slug, 'timezone', b.timezone,
      'currency', b.currency, 'cancellation_hours', b.cancellation_hours,
      'service_name', s.name, 'staff_name', st.display_name
    ) order by bk.starts_at desc)
    from public.bookings bk
    join public.customers c on c.id = bk.customer_id
    join public.businesses b on b.id = bk.business_id
    join public.services s on s.id = bk.service_id
    join public.staff st on st.id = bk.staff_id
    where c.user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

-- ───────────────────────── onboarding ─────────────────────────
create or replace function public.approve_application(p_application_id uuid, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a public.business_applications;
  v_slug text;
  v_code text;
  v_base text;
  v_i int := 1;
  v_business uuid;
  v_currency text;
  v_owner public.profiles;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into a from public.business_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if a.status <> 'pending' then raise exception 'application_not_pending'; end if;

  v_base := nullif(public.slugify(a.business_name), '');
  v_base := coalesce(v_base, 'negocio');
  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i;
  end loop;

  v_base := upper(left(regexp_replace(public.slugify(a.business_name), '[^a-z0-9]', '', 'g'), 8));
  if length(v_base) < 4 then v_base := rpad(v_base, 4, 'X'); end if;
  v_code := v_base;
  v_i := 1;
  while exists (select 1 from public.businesses where booking_code = v_code) loop
    v_i := v_i + 1;
    v_code := left(v_base, 8) || v_i::text;
  end loop;

  v_currency := case
    when a.timezone = 'America/Bogota' then 'COP'
    when a.timezone like 'America/Mexico%' or a.timezone in ('America/Monterrey', 'America/Cancun', 'America/Tijuana') then 'MXN'
    when a.timezone = 'America/Lima' then 'PEN'
    when a.timezone = 'America/Santiago' then 'CLP'
    when a.timezone like 'America/Argentina%' then 'ARS'
    when a.timezone like 'Europe/%' then 'EUR'
    else 'USD' end;

  insert into public.businesses (slug, name, category, city, timezone, currency, phone, booking_code)
  values (v_slug, a.business_name, a.category, a.city, a.timezone, v_currency, a.phone, v_code)
  returning id into v_business;

  insert into public.memberships (business_id, user_id, role) values (v_business, a.user_id, 'owner');

  update public.business_applications
  set status = 'approved', reviewer_note = p_note, reviewed_at = now(),
      reviewed_by = auth.uid(), business_id = v_business
  where id = a.id;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, meta)
  values (v_business, auth.uid(), 'application.approved', 'business_application', a.id, '{}'::jsonb);

  select * into v_owner from public.profiles where id = a.user_id;
  return jsonb_build_object(
    'business_id', v_business, 'slug', v_slug, 'booking_code', v_code,
    'business_name', a.business_name, 'owner_email', v_owner.email, 'owner_name', v_owner.full_name
  );
end;
$$;

create or replace function public.reject_application(p_application_id uuid, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a public.business_applications;
  v_owner public.profiles;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  update public.business_applications
  set status = 'rejected', reviewer_note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_application_id and status = 'pending'
  returning * into a;
  if not found then raise exception 'application_not_pending'; end if;
  select * into v_owner from public.profiles where id = a.user_id;
  return jsonb_build_object('business_name', a.business_name, 'owner_email', v_owner.email, 'owner_name', v_owner.full_name);
end;
$$;

create or replace function public.invite_staff(p_business_id uuid, p_email text, p_staff_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not public.is_owner(p_business_id) then raise exception 'forbidden'; end if;
  if p_staff_id is not null and not exists (
    select 1 from public.staff where id = p_staff_id and business_id = p_business_id
  ) then
    raise exception 'staff_not_found';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is not null then
    insert into public.memberships (business_id, user_id, role, staff_id)
    values (p_business_id, v_user, 'staff', p_staff_id)
    on conflict (business_id, user_id) do update set staff_id = excluded.staff_id
      where public.memberships.role = 'staff';
    return jsonb_build_object('status', 'added');
  end if;
  insert into public.staff_invitations (business_id, email, staff_id)
  values (p_business_id, lower(trim(p_email)), p_staff_id)
  on conflict (business_id, email) do update set staff_id = excluded.staff_id, accepted_at = null;
  return jsonb_build_object('status', 'invited');
end;
$$;

-- ───────────────────────── metrics ─────────────────────────
create or replace function public.admin_metrics()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'active_businesses', (select count(*) from public.businesses where status = 'active'),
    'suspended_businesses', (select count(*) from public.businesses where status = 'suspended'),
    'pending_applications', (select count(*) from public.business_applications where status = 'pending'),
    'bookings_30d', (select count(*) from public.bookings where created_at > now() - interval '30 days'),
    'bot_messages_30d', (
      select count(*) from public.messages
      where role = 'assistant' and created_at > now() - interval '30 days'
    ),
    'bookings_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join (
        select created_at::date as day, count(*) as n from public.bookings
        where created_at > now() - interval '31 days' group by 1
      ) c on c.day = d::date
    )
  );
end;
$$;

create or replace function public.business_metrics(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses;
  v_today date;
begin
  if not (public.is_owner(p_business_id) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  select * into b from public.businesses where id = p_business_id;
  v_today := (now() at time zone b.timezone)::date;
  return jsonb_build_object(
    'today_bookings', (
      select count(*) from public.bookings
      where business_id = b.id and (starts_at at time zone b.timezone)::date = v_today
        and status not in ('cancelled')
    ),
    'today_revenue', (
      select coalesce(sum(price), 0) from public.bookings
      where business_id = b.id and (starts_at at time zone b.timezone)::date = v_today
        and status in ('confirmed', 'completed')
    ),
    'today_no_shows', (
      select count(*) from public.bookings
      where business_id = b.id and (starts_at at time zone b.timezone)::date = v_today and status = 'no_show'
    ),
    'bot_share_30d', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where source = 'whatsapp') / count(*)) end
      from public.bookings where business_id = b.id and created_at > now() - interval '30 days'
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date, 'bookings', coalesce(x.n, 0), 'revenue', coalesce(x.revenue, 0)
      ) order by d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') d
      left join (
        select (starts_at at time zone b.timezone)::date as day, count(*) as n,
               sum(price) filter (where status in ('confirmed', 'completed')) as revenue
        from public.bookings
        where business_id = b.id and status <> 'cancelled'
          and starts_at > now() - interval '32 days'
        group by 1
      ) x on x.day = d::date
    )
  );
end;
$$;

-- ───────────────────────── scheduled jobs ─────────────────────────
create or replace function public.expire_pending_payments()
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  n int;
begin
  update public.bookings
  set status = 'cancelled', cancelled_reason = 'payment_expired', deposit_status = 'none'
  where status = 'pending_payment' and created_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.expire_pending_payments() from public, anon, authenticated;
