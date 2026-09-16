-- 0007_proofs: proof media metadata, judge verdicts, job claiming, storage bucket.

create table proofs (
  id                    uuid primary key default gen_random_uuid(),
  bet_id                uuid not null references bets(id) on delete cascade,
  submitter_id          uuid not null references users(id),
  provider_message_id   text not null,
  storage_path          text not null,
  mime                  text not null,
  bytes                 bigint not null,
  sha256                text not null,
  phash                 text,
  exif                  jsonb not null default '{}'::jsonb,
  captured_at           timestamptz,
  received_at           timestamptz not null default now(),
  status                text not null default 'received' check (status in ('received', 'rejected_duplicate', 'judged')),
  unique (bet_id, sha256)
);

create index proofs_bet_idx on proofs (bet_id, received_at);

create table verdicts (
  id                        uuid primary key default gen_random_uuid(),
  bet_id                    uuid not null references bets(id) on delete cascade,
  proof_id                  uuid not null references proofs(id),
  pass                      integer not null check (pass in (1, 2)),
  outcome                   text not null check (outcome in ('for', 'against', 'inconclusive')),
  confidence                numeric(4, 3) not null,
  criteria_checks           jsonb not null default '[]'::jsonb,
  challenge_token_visible   boolean not null default false,
  tamper_flags              jsonb not null default '[]'::jsonb,
  reasoning                 text not null,
  model                     text not null,
  created_at                timestamptz not null default now()
);

create index verdicts_bet_idx on verdicts (bet_id, created_at);

-- Claim up to N queued jobs of a kind, skipping rows another tick holds.
create or replace function claim_jobs(p_kind text, p_limit integer, p_max_attempts integer)
returns table (id uuid, kind text, payload jsonb, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id from jobs j
    where j.kind = p_kind and j.status = 'queued' and j.run_after <= now() and j.attempts < p_max_attempts
    order by j.created_at
    limit p_limit
    for update skip locked
  )
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  from picked where j.id = picked.id
  returning j.id, j.kind, j.payload, j.attempts;
end;
$$;

-- Failed jobs go back to the queue with a delay; the attempt cap in claim_jobs stops the loop.
create or replace function requeue_job(p_id uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update jobs set status = 'queued', last_error = p_error, locked_at = null, run_after = now() + interval '2 minutes' where id = p_id;
$$;

alter table proofs enable row level security;
alter table verdicts enable row level security;

create policy "participants read proofs" on proofs
  for select using (
    exists (
      select 1 from bet_participants bp join users u on u.id = bp.user_id
      where bp.bet_id = proofs.bet_id and u.auth_user_id = auth.uid()
    )
  );

create policy "participants read verdicts" on verdicts
  for select using (
    exists (
      select 1 from bet_participants bp join users u on u.id = bp.user_id
      where bp.bet_id = verdicts.bet_id and u.auth_user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('proofs', 'proofs', false, 52428800)
on conflict (id) do nothing;
