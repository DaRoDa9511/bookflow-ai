-- BookFlow AI · core schema
create extension if not exists btree_gist;

-- ───────────────────────── enums ─────────────────────────
create type public.business_category as enum ('barbershop', 'salon', 'clinic', 'spa', 'other');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.business_status as enum ('active', 'suspended');
create type public.member_role as enum ('owner', 'staff');
create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show');
create type public.booking_source as enum ('whatsapp', 'web', 'admin');
create type public.deposit_status as enum ('none', 'pending', 'paid', 'refunded');
create type public.conversation_channel as enum ('whatsapp', 'simulator');
create type public.message_direction as enum ('in', 'out');
create type public.message_role as enum ('user', 'assistant', 'tool', 'system');
create type public.reminder_status as enum ('scheduled', 'sent', 'failed', 'skipped');

-- ───────────────────────── tables ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.business_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  business_name text not null check (length(business_name) between 2 and 80),
  category public.business_category not null,
  city text not null,
  phone text not null,
  timezone text not null,
  status public.application_status not null default 'pending',
  reviewer_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  business_id uuid,
  created_at timestamptz not null default now()
);
create index on public.business_applications (status, created_at);
create unique index business_applications_one_pending_per_user
  on public.business_applications (user_id) where status = 'pending';

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  category public.business_category not null default 'other',
  city text,
  timezone text not null default 'America/Bogota',
  currency text not null default 'USD',
  phone text,
  address text,
  logo_url text,
  status public.business_status not null default 'active',
  booking_code text not null unique check (booking_code ~ '^[A-Z0-9]{4,12}$'),
  deposit_required boolean not null default false,
  deposit_amount numeric(12, 2) not null default 0,
  cancellation_hours int not null default 4 check (cancellation_hours >= 0),
  reminder_hours int[] not null default '{24,2}',
  bot_tone text not null default 'friendly',
  bot_instructions text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.business_applications
  add constraint business_applications_business_fk
  foreign key (business_id) references public.businesses (id) on delete set null;

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  display_name text not null,
  bio text,
  avatar_url text,
  is_active boolean not null default true,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);
create index on public.staff (business_id);

create table public.memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  staff_id uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.memberships (user_id);

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  staff_id uuid references public.staff (id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  duration_min int not null check (duration_min between 5 and 600),
  price numeric(12, 2) not null default 0 check (price >= 0),
  buffer_min int not null default 0 check (buffer_min between 0 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.services (business_id);

create table public.staff_services (
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);
create index on public.staff_services (service_id);

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index on public.working_hours (staff_id, weekday);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);
create index on public.time_off (business_id, starts_at);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  name text,
  notes text,
  opted_in_whatsapp boolean not null default true,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  staff_id uuid not null references public.staff (id),
  service_id uuid not null references public.services (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'confirmed',
  source public.booking_source not null default 'web',
  price numeric(12, 2) not null default 0,
  deposit_status public.deposit_status not null default 'none',
  stripe_session_id text,
  notes text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- No overlapping active appointments for the same staff member.
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'pending_payment'))
);
create index on public.bookings (business_id, starts_at);
create index on public.bookings (customer_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  phone text not null,
  channel public.conversation_channel not null default 'simulator',
  state jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  handoff_to_human boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.conversations (phone, channel, last_message_at desc);
create index on public.conversations (business_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  direction public.message_direction not null,
  role public.message_role not null,
  content text not null default '',
  tool_name text,
  tool_payload jsonb,
  provider_message_id text,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
create unique index messages_provider_message_id_key
  on public.messages (provider_message_id) where provider_message_id is not null;

create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.knowledge_base (business_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  send_at timestamptz not null,
  kind text not null,
  status public.reminder_status not null default 'scheduled',
  sent_at timestamptz,
  error text,
  unique (booking_id, kind)
);
create index on public.reminders (status, send_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (business_id, created_at desc);
