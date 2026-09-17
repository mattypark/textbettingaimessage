-- 0014_bet_drafts: the scripted bet builder. "hey mushy" opens a draft for
-- that person in that chat; their next answers fill claim, stake, deadline;
-- the card posts and the draft clears. No model involved.

create table bet_drafts (
  chat_id     uuid not null references chats(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  step        text not null check (step in ('claim', 'stake', 'deadline')),
  claim       text,
  stake       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table bet_drafts enable row level security;
