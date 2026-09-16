-- 0008_web: RLS-safe reads for the signed-in user.

create or replace function my_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid();
$$;

create or replace function my_wallet(p_currency text default 'PTS')
returns table (available bigint, held bigint, honor_score integer, terms_version_accepted integer)
language sql stable security definer set search_path = public as $$
  select
    account_balance('user', my_user_id()::text, p_currency) as available,
    user_held_balance(my_user_id(), p_currency) as held,
    (select honor_score from users where id = my_user_id()) as honor_score,
    (select max(terms_version) from terms_acceptances where user_id = my_user_id()) as terms_version_accepted;
$$;

grant execute on function my_user_id() to authenticated;
grant execute on function my_wallet(text) to authenticated;

-- Honor score is public within a chat: members read each other's users rows.
create policy "members read co-members" on users
  for select using (
    exists (
      select 1 from chat_members a join chat_members b on a.chat_id = b.chat_id
      join users me on me.id = a.user_id
      where me.auth_user_id = auth.uid() and b.user_id = users.id
    )
  );
