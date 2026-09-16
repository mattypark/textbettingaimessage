-- 0006_cron: attempt counters + the once-a-minute tick.
-- The tick URL and bearer secret are database settings so the migration
-- carries no environment-specific values. Set them once per environment:
--   alter database postgres set app.tick_url = 'https://<site>/api/cron/tick';
--   alter database postgres set app.cron_secret = '<CRON_SECRET>';
-- then `select cron.schedule(...)` below picks them up on each run.

create or replace function bump_inbound_attempt(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update provider_messages set attempts = attempts + 1 where id = p_id;
$$;

create or replace function bump_outbound_attempt(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update outbound_messages set attempts = attempts + 1 where id = p_id;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Runs every minute. No-op (with a notice) until the settings exist.
create or replace function app_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := current_setting('app.tick_url', true);
  v_secret text := current_setting('app.cron_secret', true);
begin
  if v_url is null or v_secret is null then
    raise notice 'app_tick: app.tick_url / app.cron_secret not set';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'app_tick') then
    perform cron.schedule('app_tick', '* * * * *', 'select app_tick()');
  end if;
end;
$$;
