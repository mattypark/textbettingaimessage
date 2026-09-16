-- 0002_ledger: double-entry points ledger.
-- Invariants enforced here, not in app code:
--   * every transaction's entries sum to zero (deferred constraint trigger)
--   * entries are append-only (no UPDATE/DELETE)
--   * user-owned accounts never go negative (checked under row lock)
--   * idempotency_key makes a retried posting a no-op

create type account_owner_type as enum ('user', 'bet_escrow', 'dispute_bond', 'house');
create type ledger_txn_kind as enum (
  'grant', 'hold', 'release', 'settle', 'bond', 'bond_forfeit', 'bond_release', 'adjust'
);

create table ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  owner_type  account_owner_type not null,
  owner_id    text not null,
  currency    text not null default 'PTS',
  created_at  timestamptz not null default now(),
  unique (owner_type, owner_id, currency)
);

create table ledger_transactions (
  id               uuid primary key default gen_random_uuid(),
  kind             ledger_txn_kind not null,
  bet_id           uuid,
  dispute_id       uuid,
  user_id          uuid,
  idempotency_key  text not null unique,
  memo             text,
  created_at       timestamptz not null default now()
);

create index ledger_transactions_bet_idx on ledger_transactions (bet_id) where bet_id is not null;
create index ledger_transactions_dispute_idx on ledger_transactions (dispute_id) where dispute_id is not null;

create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  txn_id      uuid not null references ledger_transactions(id) on delete restrict,
  account_id  uuid not null references ledger_accounts(id) on delete restrict,
  amount      bigint not null,
  created_at  timestamptz not null default now()
);

create index ledger_entries_account_idx on ledger_entries (account_id);
create index ledger_entries_txn_idx on ledger_entries (txn_id);

-- Append-only.
create or replace function ledger_entries_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger_entries are append-only';
end;
$$;

create trigger ledger_entries_no_update
  before update or delete on ledger_entries
  for each row execute function ledger_entries_immutable();

-- Sum-to-zero per transaction, checked at commit so multi-row inserts pass.
create or replace function ledger_txn_balanced() returns trigger
language plpgsql as $$
declare
  v_sum bigint;
begin
  select coalesce(sum(amount), 0) into v_sum from ledger_entries where txn_id = new.txn_id;
  if v_sum <> 0 then
    raise exception 'ledger transaction % is unbalanced (sum=%)', new.txn_id, v_sum;
  end if;
  return null;
end;
$$;

create constraint trigger ledger_txn_must_balance
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function ledger_txn_balanced();

create view account_balances as
  select a.id as account_id, a.owner_type, a.owner_id, a.currency, coalesce(sum(e.amount), 0)::bigint as balance
  from ledger_accounts a
  left join ledger_entries e on e.account_id = a.id
  group by a.id;

create or replace function ensure_account(p_owner_type account_owner_type, p_owner_id text, p_currency text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ledger_accounts (owner_type, owner_id, currency)
  values (p_owner_type, p_owner_id, p_currency)
  on conflict (owner_type, owner_id, currency) do update set currency = excluded.currency
  returning id into v_id;
  return v_id;
end;
$$;

-- Post one balanced transaction. `p_entries` is a JSON array of
-- {owner_type, owner_id, amount}. Locks the touched accounts in a stable
-- order, then refuses any user account that would go negative.
create or replace function post_ledger_txn(
  p_kind ledger_txn_kind,
  p_entries jsonb,
  p_idempotency_key text,
  p_bet_id uuid default null,
  p_dispute_id uuid default null,
  p_user_id uuid default null,
  p_memo text default null,
  p_currency text default 'PTS'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn uuid;
  v_entry jsonb;
  v_account uuid;
  v_amount bigint;
  v_owner_type account_owner_type;
  v_balance bigint;
  v_sum bigint := 0;
begin
  select id into v_txn from ledger_transactions where idempotency_key = p_idempotency_key;
  if v_txn is not null then
    return v_txn;
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'post_ledger_txn: entries must be a non-empty array';
  end if;

  select coalesce(sum((e->>'amount')::bigint), 0) into v_sum from jsonb_array_elements(p_entries) e;
  if v_sum <> 0 then
    raise exception 'post_ledger_txn: entries sum to %, expected 0', v_sum;
  end if;

  -- Materialize accounts, then lock them in id order to avoid deadlocks.
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    perform ensure_account((v_entry->>'owner_type')::account_owner_type, v_entry->>'owner_id', p_currency);
  end loop;

  perform 1 from ledger_accounts a
  where (a.owner_type::text, a.owner_id) in (
    select e->>'owner_type', e->>'owner_id' from jsonb_array_elements(p_entries) e
  ) and a.currency = p_currency
  order by a.id
  for update;

  insert into ledger_transactions (kind, bet_id, dispute_id, user_id, idempotency_key, memo)
  values (p_kind, p_bet_id, p_dispute_id, p_user_id, p_idempotency_key, p_memo)
  returning id into v_txn;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_owner_type := (v_entry->>'owner_type')::account_owner_type;
    v_amount := (v_entry->>'amount')::bigint;
    select id into v_account from ledger_accounts
    where owner_type = v_owner_type and owner_id = v_entry->>'owner_id' and currency = p_currency;

    if v_owner_type = 'user' then
      select coalesce(sum(amount), 0) into v_balance from ledger_entries where account_id = v_account;
      if v_balance + v_amount < 0 then
        raise exception 'insufficient balance for user % (have %, need %)', v_entry->>'owner_id', v_balance, -v_amount
          using errcode = 'check_violation';
      end if;
    end if;

    insert into ledger_entries (txn_id, account_id, amount) values (v_txn, v_account, v_amount);
  end loop;

  return v_txn;
end;
$$;

-- Balance of one account (0 if it does not exist yet).
create or replace function account_balance(p_owner_type account_owner_type, p_owner_id text, p_currency text default 'PTS')
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sum(e.amount) from ledger_entries e
    join ledger_accounts a on a.id = e.account_id
    where a.owner_type = p_owner_type and a.owner_id = p_owner_id and a.currency = p_currency
  ), 0)::bigint;
$$;

-- Entries of the hold/bond transactions on a bet or dispute, for release/settle.
create or replace function ledger_pool_entries(p_kind ledger_txn_kind, p_bet_id uuid, p_dispute_id uuid default null)
returns table (txn_id uuid, user_id uuid, owner_type account_owner_type, owner_id text, amount bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.user_id, a.owner_type, a.owner_id, e.amount
  from ledger_transactions t
  join ledger_entries e on e.txn_id = t.id
  join ledger_accounts a on a.id = e.account_id
  where t.kind = p_kind
    and (p_bet_id is null or t.bet_id = p_bet_id)
    and (p_dispute_id is null or t.dispute_id = p_dispute_id)
  order by t.created_at;
$$;

alter table ledger_accounts enable row level security;
alter table ledger_transactions enable row level security;
alter table ledger_entries enable row level security;

create policy "users read own entries" on ledger_entries
  for select using (
    exists (
      select 1 from ledger_accounts a
      join users u on u.id::text = a.owner_id
      where a.id = ledger_entries.account_id and a.owner_type = 'user' and u.auth_user_id = auth.uid()
    )
  );

-- Points a user has sitting in escrow/bond pools that have not been drained.
create or replace function user_held_balance(p_user_id uuid, p_currency text default 'PTS')
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pool.amount), 0)::bigint
  from (
    select e.amount, a.owner_type, a.owner_id
    from ledger_transactions t
    join ledger_entries e on e.txn_id = t.id
    join ledger_accounts a on a.id = e.account_id
    where t.user_id = p_user_id
      and t.kind in ('hold', 'bond')
      and a.owner_type in ('bet_escrow', 'dispute_bond')
      and a.currency = p_currency
  ) pool
  where account_balance(pool.owner_type, pool.owner_id, p_currency) > 0;
$$;
