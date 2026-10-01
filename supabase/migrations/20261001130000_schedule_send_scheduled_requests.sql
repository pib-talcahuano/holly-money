-- Daily pg_cron job that pings the Next.js cron route, which submits due scheduled drafts.
-- See https://supabase.com/docs/guides/functions/schedule-functions (same pg_cron + pg_net + Vault
-- pattern, but targeting our own route instead of an Edge Function so email/audit logic stays in
-- the service layer).
--
-- Requires two Vault secrets, created once per environment (NOT stored in migrations):
--   select vault.create_secret('https://your-app-domain', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET env var>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_send_scheduled_requests()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  -- Not configured in this environment (e.g. local dev): do nothing
  if app_url is null or cron_secret is null then
    raise warning 'invoke_send_scheduled_requests: app_url/cron_secret missing in Vault, skipping';
    return;
  end if;

  perform net.http_post(
    url := app_url || '/api/cron/send-scheduled-requests',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_send_scheduled_requests() from public, anon, authenticated;

-- 11:00 UTC daily (07:00/08:00 America/Santiago)
select cron.schedule(
  'send-scheduled-requests',
  '0 11 * * *',
  $$ select public.invoke_send_scheduled_requests(); $$
);
