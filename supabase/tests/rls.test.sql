-- pgTAP RLS tests for `supabase test db` (local stack). The same scenarios run in
-- CI through Vitest + PGlite (supabase/tests/rls.test.ts).
begin;
select plan(6);

-- Owner of Barbería Don Pepe
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

select is(
  (select count(*)::int from public.businesses),
  1,
  'owner sees only their own business'
);
select is(
  (select count(*)::int from public.bookings where business_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'owner cannot read bookings of another business'
);
select is(
  (select count(*)::int from public.customers where business_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'owner cannot read customers of another business'
);

-- Staff (barbero Carlos)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select is(
  (select count(*)::int from public.bookings where staff_id <> 'b1000000-0000-0000-0000-000000000002'),
  0,
  'staff only sees their own appointments'
);
select is(
  (with u as (
     update public.bookings set notes = 'x'
     where staff_id <> 'b1000000-0000-0000-0000-000000000002' returning 1
   ) select count(*)::int from u),
  0,
  'staff cannot edit appointments of other staff'
);

-- Anonymous
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  'select * from public.customers',
  '42501',
  null,
  'anon cannot read customers'
);

select * from finish();
rollback;
