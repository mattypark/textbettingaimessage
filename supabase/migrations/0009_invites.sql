-- 0009_invites: invite-only access. Visiting is open; talking to the bot
-- needs an invite code (from a member) or a waitlist promotion.

alter table users add column access text not null default 'waitlist' check (access in ('waitlist', 'active'));
alter table users add column activated_at timestamptz;

create table invites (
  code           text primary key,                        -- short, shareable
  owner_user_id  uuid references users(id) on delete cascade,
  max_uses       integer not null default 3,
  uses           integer not null default 0,
  created_at     timestamptz not null default now()
);

create index invites_owner_idx on invites (owner_user_id);

create table invite_redemptions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null references invites(code),
  phone         text not null,
  user_id       uuid references users(id),
  redeemed_at   timestamptz not null default now(),
  unique (code, phone)
);

create table waitlist (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,
  referral_code   text not null unique,                    -- what they share
  referred_by     text,                                    -- a waitlist referral_code or invite code
  referral_count  integer not null default 0,
  position        bigserial,
  created_at      timestamptz not null default now(),
  activated_at    timestamptz
);

create index waitlist_position_idx on waitlist (position) where activated_at is null;

-- Effective queue rank: everyone ahead of you who is still waiting, with
-- referrals pulling you forward (each referral is worth a few hundred spots).
create or replace function waitlist_rank(p_phone text) returns integer
language sql stable security definer set search_path = public as $$
  with me as (select position, referral_count from waitlist where phone = p_phone and activated_at is null)
  select coalesce((
    select count(*)::integer + 1 from waitlist w, me
    where w.activated_at is null
      and (w.position - 300 * w.referral_count) < (me.position - 300 * me.referral_count)
  ), 0);
$$;

-- Redeem an invite for a phone: bumps uses under a row lock, activates the
-- user, and gives them their own code. Returns the new user's own code.
create or replace function redeem_invite(p_code text, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_user uuid;
  v_own text;
begin
  select * into v_invite from invites where code = upper(p_code) for update;
  if v_invite.code is null then
    raise exception 'invalid invite code' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_redemptions r where r.code = v_invite.code and r.phone = p_phone) then
    -- Same phone re-entering the same link: idempotent.
    select id into v_user from users where phone = p_phone;
  else
    if v_invite.uses >= v_invite.max_uses then
      raise exception 'invite code is used up' using errcode = 'P0002';
    end if;
    update invites set uses = uses + 1 where code = v_invite.code;
    insert into users (phone) values (p_phone) on conflict (phone) do nothing;
    select id into v_user from users where phone = p_phone;
    insert into invite_redemptions (code, phone, user_id) values (v_invite.code, p_phone, v_user);
  end if;

  update users set access = 'active', activated_at = coalesce(activated_at, now()) where id = v_user;
  update waitlist set activated_at = coalesce(activated_at, now()) where phone = p_phone;

  select code into v_own from invites where owner_user_id = v_user limit 1;
  if v_own is null then
    v_own := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into invites (code, owner_user_id) values (v_own, v_user);
  end if;
  return v_own;
end;
$$;

-- Join the waitlist (idempotent per phone). Counts a referral for whoever sent them.
create or replace function join_waitlist(p_phone text, p_referred_by text) returns table (referral_code text, rank integer, activated boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_new boolean := false;
begin
  select w.referral_code into v_code from waitlist w where w.phone = p_phone;
  if v_code is null then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into waitlist (phone, referral_code, referred_by) values (p_phone, v_code, nullif(upper(p_referred_by), ''));
    v_new := true;
    if p_referred_by is not null and p_referred_by <> '' then
      update waitlist set referral_count = referral_count + 1 where waitlist.referral_code = upper(p_referred_by) and phone <> p_phone;
    end if;
  end if;
  return query select v_code, waitlist_rank(p_phone), exists (select 1 from users u where u.phone = p_phone and u.access = 'active');
end;
$$;

-- Three referrals = in. Called by the tick; activates and hands out an invite code.
create or replace function promote_waitlist(p_threshold integer default 3, p_limit integer default 50) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select phone from waitlist where activated_at is null and referral_count >= p_threshold order by position limit p_limit
  loop
    insert into users (phone) values (v_row.phone) on conflict (phone) do nothing;
    update users set access = 'active', activated_at = coalesce(activated_at, now()) where phone = v_row.phone;
    update waitlist set activated_at = now() where phone = v_row.phone;
    insert into invites (code, owner_user_id)
      select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), id from users where phone = v_row.phone
      and not exists (select 1 from invites i where i.owner_user_id = users.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

alter table invites enable row level security;
alter table invite_redemptions enable row level security;
alter table waitlist enable row level security;

create policy "owners read their invites" on invites
  for select using (exists (select 1 from users u where u.id = invites.owner_user_id and u.auth_user_id = auth.uid()));
