-- 0001_core: identity, chats, and the message inbox/outbox.
-- Money and bets arrive in 0002/0003. Everything here is provider-agnostic.

create extension if not exists pgcrypto;

create type provider_name as enum ('linq', 'sendblue', 'fake');
create type message_direction as enum ('in', 'out');
create type inbox_status as enum ('pending', 'processing', 'processed', 'ignored', 'failed');
create type outbox_status as enum ('queued', 'sent', 'failed');

create table users (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,                 -- E.164
  display_name  text,
  auth_user_id  uuid unique,                          -- Supabase Auth link, set on web sign-in
  honor_score   integer not null default 100,
  created_at    timestamptz not null default now()
);

create table chats (
  id                          uuid primary key default gen_random_uuid(),
  provider                    provider_name not null,
  provider_chat_id            text not null,
  is_group                    boolean not null default false,
  name                        text,
  bot_introduced_at           timestamptz,
  terms_message_provider_id   text,
  created_at                  timestamptz not null default now(),
  unique (provider, provider_chat_id)
);

create table chat_members (
  chat_id       uuid not null references chats(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  handle        text not null,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- Inbox. One row per provider message; the unique index is the idempotency
-- guard for webhook retries. `raw` keeps the vendor payload for replay.
create table provider_messages (
  id                    uuid primary key default gen_random_uuid(),
  provider              provider_name not null,
  provider_message_id   text not null,
  chat_id               uuid references chats(id) on delete set null,
  direction             message_direction not null,
  sender_handle         text,
  raw                   jsonb,
  normalized            jsonb,
  status                inbox_status not null default 'pending',
  attempts              integer not null default 0,
  last_error            text,
  received_at           timestamptz not null default now(),
  processed_at          timestamptz,
  unique (provider, provider_message_id)
);

create index provider_messages_pending_idx
  on provider_messages (status, received_at)
  where status in ('pending', 'processing');

-- Outbox. Every send is queued here first so a crashed request can be
-- replayed by the cron tick without double-sending (idempotency_key).
create table outbound_messages (
  id                    uuid primary key default gen_random_uuid(),
  chat_id               uuid not null references chats(id) on delete cascade,
  body                  jsonb not null,
  idempotency_key       text not null unique,
  status                outbox_status not null default 'queued',
  provider_message_id   text,
  attempts              integer not null default 0,
  last_error            text,
  not_before            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  sent_at               timestamptz
);

create index outbound_messages_queued_idx
  on outbound_messages (status, not_before)
  where status = 'queued';

-- Insert-if-absent for the inbox. Returns the new row id, or null when the
-- provider already delivered this message (webhook retry).
create or replace function claim_inbound(
  p_provider provider_name,
  p_provider_message_id text,
  p_direction message_direction,
  p_sender_handle text,
  p_raw jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into provider_messages (provider, provider_message_id, direction, sender_handle, raw)
  values (p_provider, p_provider_message_id, p_direction, p_sender_handle, p_raw)
  on conflict (provider, provider_message_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Row level security: server code uses the service role; the web app only
-- ever reads its own rows through policies added alongside each feature.
alter table users enable row level security;
alter table chats enable row level security;
alter table chat_members enable row level security;
alter table provider_messages enable row level security;
alter table outbound_messages enable row level security;

create policy "users read self" on users
  for select using (auth_user_id = auth.uid());

create policy "members read their chats" on chats
  for select using (
    exists (
      select 1 from chat_members m
      join users u on u.id = m.user_id
      where m.chat_id = chats.id and u.auth_user_id = auth.uid()
    )
  );

create policy "members read memberships" on chat_members
  for select using (
    exists (select 1 from users u where u.id = chat_members.user_id and u.auth_user_id = auth.uid())
  );
