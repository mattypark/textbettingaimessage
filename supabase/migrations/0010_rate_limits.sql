-- 0010_rate_limits: fixed-window counters shared across serverless
-- instances. Used by POST /api/join (per IP and per phone); any other
-- public endpoint can reuse rate_limit_hit with its own key prefix.

create table rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

-- One call = one hit. Returns whether this hit is within the limit and how
-- long until the window rolls, so the route can send Retry-After.
create or replace function rate_limit_hit(p_key text, p_limit integer, p_window_secs integer)
returns table (allowed boolean, retry_after_secs integer)
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  v_count integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning rate_limits.count into v_count;

  -- Occasional sweep so the table stays small without a cron entry.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select
    v_count <= p_limit,
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_secs) - now())))::integer);
end;
$$;

-- Service role only: no policies, RLS on.
alter table rate_limits enable row level security;
