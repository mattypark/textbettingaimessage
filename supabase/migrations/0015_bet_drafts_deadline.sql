-- 0015: a draft keeps its answered deadline while the terms are pending,
-- so "i agree" finishes the bet without asking again.
alter table bet_drafts add column deadline_at timestamptz;
