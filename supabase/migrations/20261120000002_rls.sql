-- BookFlow AI · auth helpers, triggers and row level security

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_member(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.business_id = bid and m.user_id = auth.uid());
$$;

create or replace function public.is_owner(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = bid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.my_staff_id(bid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.staff_id from public.memberships m where m.business_id = bid and m.user_id = auth.uid();
$$;

-- True for the service role (Edge Functions) and for direct DB sessions without a
-- JWT (pg_cron, migrations, seed). Never true for anon/authenticated callers.
create or replace function public.is_service_role()
returns boolean language sql stable as $$
  select auth.role() is null or auth.role() = 'service_role';
$$;

-- Security definer lookups used inside policies to avoid recursive RLS between
-- customers and bookings.
create or replace function public.is_my_staff_customer(cid uuid, bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.customer_id = cid and b.staff_id = public.my_staff_id(bid)
  );
$$;

create or replace function public.is_my_customer_record(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.customers c where c.id = cid and c.user_id = auth.uid());
$$;

-- ───────────────────────── triggers ─────────────────────────
-- New auth user → profile, and accept pending staff invitations for that email.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv record;
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    case when new.phone is not null and new.phone <> '' then '+' || ltrim(new.phone, '+') end
  )
  on conflict (id) do nothing;

  if new.email is not null then
    for inv in
      select * from public.staff_invitations
      where lower(email) = lower(new.email) and accepted_at is null
    loop
      insert into public.memberships (business_id, user_id, role, staff_id)
      values (inv.business_id, new.id, 'staff', inv.staff_id)
      on conflict do nothing;
      update public.staff_invitations set accepted_at = now() where id = inv.id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- Confirmed booking created or moved → (re)compute its reminders.
create or replace function public.sync_booking_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  h int;
  hours int[];
begin
  delete from public.reminders where booking_id = new.id and status = 'scheduled';
  if new.status = 'confirmed' then
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

create trigger bookings_reminders_ins after insert on public.bookings
  for each row execute function public.sync_booking_reminders();
create trigger bookings_reminders_upd after update of starts_at, status on public.bookings
  for each row
  when (old.starts_at is distinct from new.starts_at or old.status is distinct from new.status)
  execute function public.sync_booking_reminders();

-- Audit trail for bookings.
create or replace function public.audit_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, meta)
  values (
    new.business_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'booking.created'
         when old.status is distinct from new.status then 'booking.' || new.status::text
         else 'booking.updated' end,
    'booking',
    new.id,
    jsonb_build_object('starts_at', new.starts_at, 'staff_id', new.staff_id, 'source', new.source)
  );
  return new;
end;
$$;

create trigger bookings_audit after insert or update on public.bookings
  for each row execute function public.audit_bookings();

-- ───────────────────────── grants ─────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
-- Profiles: users may only edit harmless columns (never is_super_admin).
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.business_applications enable row level security;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.reminders enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_super_admin() or exists (
    select 1 from public.memberships a join public.memberships b on a.business_id = b.business_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- business_applications
create policy applications_select on public.business_applications for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy applications_insert on public.business_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null and business_id is null);
create policy applications_update on public.business_applications for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- businesses
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_member(id) or public.is_super_admin());
create policy businesses_update on public.businesses for update to authenticated
  using (public.is_owner(id) or public.is_super_admin())
  with check (public.is_owner(id) or public.is_super_admin());
create policy businesses_insert on public.businesses for insert to authenticated
  with check (public.is_super_admin());

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_member(business_id) or public.is_super_admin());
create policy memberships_write on public.memberships for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- staff invitations
create policy invitations_owner on public.staff_invitations for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- read for members, write for owners: staff, services, staff_services, working_hours, knowledge_base
create policy staff_select on public.staff for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_write on public.staff for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy services_select on public.services for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy services_write on public.services for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy staff_services_select on public.staff_services for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_services_write on public.staff_services for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy working_hours_select on public.working_hours for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy working_hours_write on public.working_hours for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy kb_select on public.knowledge_base for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy kb_write on public.knowledge_base for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- time_off: owner everything, staff their own
create policy time_off_select on public.time_off for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy time_off_write on public.time_off for all to authenticated
  using (public.is_owner(business_id) or (staff_id is not null and staff_id = public.my_staff_id(business_id)))
  with check (public.is_owner(business_id) or (staff_id is not null and staff_id = public.my_staff_id(business_id)));

-- customers: owner all; staff only customers of their own appointments; OTP customer self
create policy customers_owner on public.customers for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy customers_staff_select on public.customers for select to authenticated
  using (public.is_my_staff_customer(id, business_id));
create policy customers_self_select on public.customers for select to authenticated
  using (user_id = auth.uid());
create policy customers_admin_select on public.customers for select to authenticated
  using (public.is_super_admin());

-- bookings
create policy bookings_owner on public.bookings for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy bookings_staff_select on public.bookings for select to authenticated
  using (staff_id = public.my_staff_id(business_id));
create policy bookings_staff_update on public.bookings for update to authenticated
  using (staff_id = public.my_staff_id(business_id))
  with check (staff_id = public.my_staff_id(business_id));
create policy bookings_customer_select on public.bookings for select to authenticated
  using (public.is_my_customer_record(customer_id));
create policy bookings_admin_select on public.bookings for select to authenticated
  using (public.is_super_admin());

-- conversations & messages: owners (and super admin read)
create policy conversations_owner on public.conversations for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy conversations_admin_select on public.conversations for select to authenticated
  using (public.is_super_admin());
create policy messages_owner on public.messages for all to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy messages_admin_select on public.messages for select to authenticated
  using (public.is_super_admin());

-- reminders & audit (read only from the panel)
create policy reminders_select on public.reminders for select to authenticated
  using (public.is_owner(business_id) or public.is_super_admin());
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_owner(business_id) or public.is_super_admin());
