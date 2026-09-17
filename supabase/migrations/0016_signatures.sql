-- 0016_signatures: the sign sheet. Everyone in a chat types their name and
-- number, reads the terms and privacy policy, and signs once. The row is
-- the e-sign record; terms_acceptances still gates stakes.

create table signatures (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid references chats(id) on delete set null,
  user_id        uuid references users(id) on delete cascade,
  phone          text not null,
  full_name      text not null,
  signature      text not null,          -- typed name, exactly as entered
  terms_version  integer not null,
  ip             text,
  user_agent     text,
  signed_at      timestamptz not null default now()
);

create index signatures_user_idx on signatures (user_id, signed_at desc);

alter table signatures enable row level security;

create policy "users read own signatures" on signatures
  for select using (exists (select 1 from users u where u.id = signatures.user_id and u.auth_user_id = auth.uid()));
