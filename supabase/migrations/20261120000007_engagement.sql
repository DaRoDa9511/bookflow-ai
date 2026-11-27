-- BookFlow AI · attendance confirmation, booking confirmation messages and richer metrics

-- The customer confirmed they will attend (reply "Confirmar" to a reminder).
alter table public.bookings add column if not exists customer_confirmed_at timestamptz;

-- A moved appointment needs a new confirmation from the customer.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  if old.starts_at is distinct from new.starts_at then
    new.customer_confirmed_at = null;
  end if;
  return new;
end;
$$;

-- Reminders now also carry the immediate "booking confirmation" message for bookings
-- made on the web or from the panel (the bot already confirms in the chat).
create or replace function public.sync_booking_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  h int;
  hours int[];
begin
  delete from public.reminders where booking_id = new.id and status = 'scheduled' and kind <> 'confirmation';
  if new.status <> 'confirmed' then
    delete from public.reminders where booking_id = new.id and status = 'scheduled';
  end if;
  if new.status = 'confirmed' then
    if tg_op = 'INSERT' and new.source in ('web', 'admin') then
      insert into public.reminders (booking_id, business_id, send_at, kind)
      values (new.id, new.business_id, now(), 'confirmation')
      on conflict (booking_id, kind) do nothing;
    end if;
    select reminder_hours into hours from public.businesses where id = new.business_id;
    foreach h in array coalesce(hours, '{}') loop
      if new.starts_at - make_interval(hours => h) > now() then
        insert into public.reminders (booking_id, business_id, send_at, kind)
        values (new.id, new.business_id, new.starts_at - make_interval(hours => h), h || 'h')
        on conflict (booking_id, kind) do update
          set send_at = excluded.send_at, status = 'scheduled', sent_at = null, error = null;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_booking_reminders() from public, anon, authenticated;

-- Richer owner metrics: week / month revenue with previous period, no-show rate, top services.
create or replace function public.business_metrics(p_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses;
  v_today date;
  v_week date;
  v_month date;
begin
  if not (public.is_owner(p_business_id) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  select * into b from public.businesses where id = p_business_id;
  v_today := (now() at time zone b.timezone)::date;
  v_week := date_trunc('week', v_today)::date;
  v_month := date_trunc('month', v_today)::date;

  return jsonb_build_object(
    'today_bookings', (
      select count(*) from public.bookings
      where business_id = b.id and (starts_at at time zone b.timezone)::date = v_today and status <> 'cancelled'
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
    'today_confirmed_by_customer', (
      select count(*) from public.bookings
      where business_id = b.id and (starts_at at time zone b.timezone)::date = v_today
        and status = 'confirmed' and customer_confirmed_at is not null
    ),
    'bot_share_30d', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where source = 'whatsapp') / count(*)) end
      from public.bookings where business_id = b.id and created_at > now() - interval '30 days'
    ),
    'revenue_week', (
      select coalesce(sum(price), 0) from public.bookings
      where business_id = b.id and status in ('confirmed', 'completed')
        and (starts_at at time zone b.timezone)::date between v_week and v_week + 6
    ),
    'revenue_prev_week', (
      select coalesce(sum(price), 0) from public.bookings
      where business_id = b.id and status in ('confirmed', 'completed')
        and (starts_at at time zone b.timezone)::date between v_week - 7 and v_week - 1
    ),
    'revenue_month', (
      select coalesce(sum(price), 0) from public.bookings
      where business_id = b.id and status in ('confirmed', 'completed')
        and (starts_at at time zone b.timezone)::date >= v_month
        and (starts_at at time zone b.timezone)::date < (v_month + interval '1 month')::date
    ),
    'revenue_prev_month', (
      select coalesce(sum(price), 0) from public.bookings
      where business_id = b.id and status in ('confirmed', 'completed')
        and (starts_at at time zone b.timezone)::date >= (v_month - interval '1 month')::date
        and (starts_at at time zone b.timezone)::date < v_month
    ),
    'no_show_rate_30d', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where status = 'no_show') / count(*)) end
      from public.bookings
      where business_id = b.id and status in ('completed', 'no_show')
        and starts_at > now() - interval '30 days' and starts_at <= now()
    ),
    'top_services', (
      select coalesce(jsonb_agg(x order by x.bookings desc), '[]'::jsonb) from (
        select s.name, count(*)::int as bookings, coalesce(sum(bk.price), 0) as revenue
        from public.bookings bk join public.services s on s.id = bk.service_id
        where bk.business_id = b.id and bk.status in ('confirmed', 'completed')
          and bk.starts_at > now() - interval '30 days'
        group by s.name order by count(*) desc limit 5
      ) x
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
        where business_id = b.id and status <> 'cancelled' and starts_at > now() - interval '32 days'
        group by 1
      ) x on x.day = d::date
    )
  );
end;
$$;

-- Booking confirmations should go out quickly: run the reminder job every minute.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bookflow-send-reminders', '* * * * *', 'select public.invoke_send_reminders()');
  end if;
end;
$$;
