-- BookFlow AI · Supabase platform wiring (Realtime, Storage, pg_cron).
-- Every block is guarded so the migrations also run on plain Postgres (tests).

-- Realtime for the live calendar and inbox.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.messages, public.conversations;
  end if;
end;
$$;

-- Public bucket for business logos: files live under "<business_id>/...".
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
    execute $p$
      create policy "logos owner insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "logos owner update" on storage.objects for update to authenticated
      using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "logos owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end;
$$;

-- Calls the send-reminders Edge Function. Needs two Vault secrets:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random>', 'cron_secret');   -- same value as CRON_SECRET
create or replace function public.invoke_send_reminders()
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3)'
    into v_id
    using v_url || '/functions/v1/send-reminders',
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
          '{}'::jsonb;
  return v_id;
end;
$$;
revoke execute on function public.invoke_send_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('bookflow-expire-pending', '*/5 * * * *', 'select public.expire_pending_payments()');
    perform cron.schedule('bookflow-send-reminders', '*/5 * * * *', 'select public.invoke_send_reminders()');
  end if;
end;
$$;
