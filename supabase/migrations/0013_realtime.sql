-- 0013_realtime: the bet page subscribes to its own row (LiveStatus hook)
-- so it refreshes when the bot moves the bet. RLS still scopes what a
-- subscriber can see. Idempotent: skips if bets is already published.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bets'
  ) then
    alter publication supabase_realtime add table public.bets;
  end if;
end $$;
