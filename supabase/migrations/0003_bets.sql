-- 0003_bets: bets, participants, audit log, honor, judge jobs.
-- The bet row is a document (jsonb `state`) mirrored by a few indexed columns;
-- the TypeScript state machine is the single source of transition rules, and
-- `apply_bet_transition` guards writes with an optimistic version check.

create type bet_status as enum (
  'proposed', 'locked', 'proof_submitted', 'judging', 'verdict_posted', 'disputed',
  'settled', 'expired', 'cancelled', 'voided'
);

create table bets (
  id                      uuid primary key default gen_random_uuid(),
  chat_id                 uuid not null references chats(id) on delete cascade,
  creator_id              uuid not null references users(id),
  status                  bet_status not null default 'proposed',
  claim                   text not null,
  stake_kind              text not null check (stake_kind in ('points', 'social', 'cash')),
  stake_amount            bigint not null default 0 check (stake_amount >= 0),
  stake_currency          text not null default 'PTS',
  stake_description       text,
  deadline_at             timestamptz not null,
  accept_by_at            timestamptz not null,
  dispute_window_ends_at  timestamptz,
  proof_grace_hours       integer not null default 12,
  no_proof_rule           text not null default 'auto_loss' check (no_proof_rule in ('auto_loss', 'void')),
  judge_kind              text not null default 'bot' check (judge_kind in ('bot', 'referee')),
  referee_user_id         uuid references users(id),
  challenge_token         text,
  card_provider_message_id text,
  terms_version           integer not null default 1,
  state                   jsonb not null,            -- full Bet document
  version                 integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  resolved_at             timestamptz
);

create index bets_chat_status_idx on bets (chat_id, status);
create index bets_accept_due_idx on bets (accept_by_at) where status = 'proposed';
create index bets_deadline_due_idx on bets (deadline_at) where status = 'locked';
create index bets_dispute_due_idx on bets (dispute_window_ends_at) where status = 'verdict_posted';

create table bet_participants (
  bet_id        uuid not null references bets(id) on delete cascade,
  user_id       uuid not null references users(id),
  side          text not null check (side in ('for', 'against')),
  required      boolean not null default true,
  accepted_at   timestamptz,
  accept_source text check (accept_source in ('reaction', 'text', 'creator')),
  primary key (bet_id, user_id)
);

create index bet_participants_user_idx on bet_participants (user_id);

-- Append-only audit of every transition. `effects_completed_at` is null
-- between the write and the end of effect execution; the cron tick replays
-- those (all effects are idempotent by key).
create table bet_events (
  id                    uuid primary key default gen_random_uuid(),
  bet_id                uuid not null references bets(id) on delete cascade,
  version               integer not null,
  from_status           bet_status not null,
  to_status             bet_status not null,
  event                 jsonb not null,
  effects               jsonb not null default '[]'::jsonb,
  actor_user_id         uuid references users(id),
  provider_message_id   text,
  effects_completed_at  timestamptz,
  created_at            timestamptz not null default now(),
  unique (bet_id, version)
);

create index bet_events_incomplete_idx on bet_events (created_at) where effects_completed_at is null;

create table honor_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  bet_id      uuid references bets(id) on delete set null,
  delta       integer not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

create index honor_events_user_idx on honor_events (user_id);

create table jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                    -- 'judge' | 'frames'
  payload     jsonb not null,
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  run_after   timestamptz not null default now(),
  attempts    integer not null default 0,
  last_error  text,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index jobs_queue_idx on jobs (run_after) where status = 'queued';

-- Guarded write: only succeeds when the row is still at `p_expected_version`.
-- Returns true on success, false when another writer got there first.
create or replace function apply_bet_transition(
  p_bet_id uuid,
  p_expected_version integer,
  p_next_state jsonb,
  p_event jsonb,
  p_effects jsonb,
  p_actor_user_id uuid default null,
  p_provider_message_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from bet_status;
  v_to bet_status := (p_next_state->>'status')::bet_status;
  v_next_version integer := (p_next_state->>'version')::integer;
  v_updated integer;
begin
  select status into v_from from bets where id = p_bet_id for update;
  if v_from is null then
    raise exception 'bet % not found', p_bet_id;
  end if;

  update bets set
    status = v_to,
    state = p_next_state,
    version = v_next_version,
    dispute_window_ends_at = nullif(p_next_state->>'disputeWindowEndsAt', '')::timestamptz,
    challenge_token = coalesce(p_next_state->>'challengeToken', challenge_token),
    resolved_at = nullif(p_next_state->>'resolvedAt', '')::timestamptz,
    updated_at = now()
  where id = p_bet_id and version = p_expected_version;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update bet_participants bp set accepted_at = (p->>'acceptedAt')::timestamptz
  from jsonb_array_elements(p_next_state->'participants') p
  where bp.bet_id = p_bet_id and bp.user_id = (p->>'userId')::uuid and bp.accepted_at is null and p->>'acceptedAt' is not null;

  insert into bet_events (bet_id, version, from_status, to_status, event, effects, actor_user_id, provider_message_id)
  values (p_bet_id, v_next_version, v_from, v_to, p_event, p_effects, p_actor_user_id, p_provider_message_id);

  return true;
end;
$$;

alter table bets enable row level security;
alter table bet_participants enable row level security;
alter table bet_events enable row level security;
alter table honor_events enable row level security;
alter table jobs enable row level security;

create policy "members read chat bets" on bets
  for select using (
    exists (
      select 1 from chat_members m join users u on u.id = m.user_id
      where m.chat_id = bets.chat_id and u.auth_user_id = auth.uid()
    )
  );

create policy "members read participants" on bet_participants
  for select using (
    exists (
      select 1 from bets b join chat_members m on m.chat_id = b.chat_id join users u on u.id = m.user_id
      where b.id = bet_participants.bet_id and u.auth_user_id = auth.uid()
    )
  );

create policy "members read bet events" on bet_events
  for select using (
    exists (
      select 1 from bets b join chat_members m on m.chat_id = b.chat_id join users u on u.id = m.user_id
      where b.id = bet_events.bet_id and u.auth_user_id = auth.uid()
    )
  );

create policy "users read own honor" on honor_events
  for select using (exists (select 1 from users u where u.id = honor_events.user_id and u.auth_user_id = auth.uid()));
