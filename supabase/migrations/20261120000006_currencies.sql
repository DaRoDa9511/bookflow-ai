-- BookFlow AI · currency per time zone for every Latin American country (incl. Bolivia)

create or replace function public.currency_for_timezone(tz text)
returns text language sql immutable set search_path = public as $$
  select case tz
    when 'America/La_Paz' then 'BOB'
    when 'America/Bogota' then 'COP'
    when 'America/Lima' then 'PEN'
    when 'America/Santiago' then 'CLP'
    when 'America/Caracas' then 'VES'
    when 'America/Asuncion' then 'PYG'
    when 'America/Montevideo' then 'UYU'
    when 'America/Sao_Paulo' then 'BRL'
    when 'America/Costa_Rica' then 'CRC'
    when 'America/Guatemala' then 'GTQ'
    when 'America/Tegucigalpa' then 'HNL'
    when 'America/Managua' then 'NIO'
    when 'America/Santo_Domingo' then 'DOP'
    else case
      when tz like 'America/Mexico%' or tz in ('America/Monterrey', 'America/Cancun', 'America/Tijuana') then 'MXN'
      when tz like 'America/Argentina%' then 'ARS'
      when tz like 'Europe/%' then 'EUR'
      else 'USD' end
  end;
$$;

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

  v_currency := public.currency_for_timezone(a.timezone);

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

revoke execute on function public.currency_for_timezone(text) from public, anon;
grant execute on function public.currency_for_timezone(text) to authenticated, service_role;
revoke execute on function public.approve_application(uuid, text) from public, anon;
grant execute on function public.approve_application(uuid, text) to authenticated;

-- Fix currencies that are not ISO 4217 codes (e.g. "BSS" typed by hand).
update public.businesses
set currency = case when upper(currency) in ('BS', 'BS.', 'BSS') then 'BOB'
                    else public.currency_for_timezone(timezone) end
where currency !~ '^[A-Z]{3}$' or upper(currency) in ('BS', 'BS.', 'BSS');
