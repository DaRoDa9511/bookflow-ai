-- BookFlow AI · least-privilege function grants (Supabase security advisor)

create or replace function public.is_service_role()
returns boolean language sql stable set search_path = public as $$
  select auth.role() is null or auth.role() = 'service_role';
$$;

-- Nothing is executable by anonymous callers by default; signed-in users keep explicit
-- access (RLS helpers and RPCs check permissions themselves)…
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- …anonymous visitors only get the three public booking RPCs…
grant execute on function public.get_public_business(text) to anon;
grant execute on function public.get_availability_context(text, uuid, uuid, date, date) to anon;
grant execute on function public.create_public_booking(text, uuid, uuid, timestamptz, text, text, public.booking_source, text)
  to anon;

-- …and trigger / cron / internal functions are never callable through the API.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.sync_booking_reminders() from authenticated;
revoke execute on function public.audit_bookings() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
revoke execute on function public.validate_slot(uuid, uuid, uuid, timestamptz, uuid, boolean) from authenticated;
revoke execute on function public.expire_pending_payments() from authenticated;
revoke execute on function public.invoke_send_reminders() from authenticated;

-- pg_net must not live in the public schema.
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end;
$$;
