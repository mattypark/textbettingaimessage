-- 0005_terms: per-user acceptance of a terms version. Stakes are gated on it.

create table terms_acceptances (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  terms_version         integer not null,
  accepted_via          text not null check (accepted_via in ('imessage', 'web')),
  provider_message_id   text,
  accepted_at           timestamptz not null default now(),
  unique (user_id, terms_version)
);

alter table terms_acceptances enable row level security;

create policy "users read own acceptances" on terms_acceptances
  for select using (exists (select 1 from users u where u.id = terms_acceptances.user_id and u.auth_user_id = auth.uid()));

-- Web acceptance for the signed-in user (RLS-safe: derives user from auth.uid()).
create or replace function accept_terms_web(p_version integer) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select id into v_user from users where auth_user_id = auth.uid();
  if v_user is null then
    raise exception 'no user for this session';
  end if;
  insert into terms_acceptances (user_id, terms_version, accepted_via)
  values (v_user, p_version, 'web')
  on conflict (user_id, terms_version) do nothing;
end;
$$;

grant execute on function accept_terms_web(integer) to authenticated;
