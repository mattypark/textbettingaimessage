-- 0011_chat_leaderboard: one RPC for /app/chats/[id]. Replaces the client-side
-- rank over every bet document in the chat, and can include each member's
-- available balance, which RLS keeps out of reach of a plain select.
--
-- Same arithmetic as src/web/leaderboard.ts rankChat: settled point bets
-- only, +stake for the side that matches the verdict, -stake otherwise.
-- Non-members get an empty set.

create or replace function chat_leaderboard(p_chat_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  phone        text,
  honor        integer,
  net_points   bigint,
  wins         integer,
  losses       integer,
  available    bigint
)
language sql stable security definer set search_path = public as $$
  with settled as (
    select
      b.stake_amount,
      b.state->'verdict'->>'outcome' as outcome,
      (p.value->>'userId')::uuid as user_id,
      p.value->>'side' as side
    from bets b
    cross join lateral jsonb_array_elements(b.state->'participants') p
    where b.chat_id = p_chat_id
      and b.status = 'settled'
      and b.stake_kind = 'points'
      and b.state->'verdict'->>'outcome' in ('for', 'against')
  ),
  tally as (
    select
      s.user_id,
      sum(case when s.side = s.outcome then s.stake_amount else -s.stake_amount end)::bigint as net_points,
      count(*) filter (where s.side = s.outcome)::integer as wins,
      count(*) filter (where s.side <> s.outcome)::integer as losses
    from settled s
    group by s.user_id
  )
  select
    u.id,
    u.display_name,
    u.phone,
    u.honor_score,
    coalesce(t.net_points, 0)::bigint,
    coalesce(t.wins, 0),
    coalesce(t.losses, 0),
    account_balance('user', u.id::text, 'PTS')
  from chat_members m
  join users u on u.id = m.user_id
  left join tally t on t.user_id = u.id
  where m.chat_id = p_chat_id
    and exists (select 1 from chat_members me where me.chat_id = p_chat_id and me.user_id = my_user_id())
  order by coalesce(t.net_points, 0) desc, u.honor_score desc, u.display_name nulls last, u.phone;
$$;

grant execute on function chat_leaderboard(uuid) to authenticated;
