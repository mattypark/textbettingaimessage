-- 0004_grants: local Supabase defaults give service_role no read/write on
-- tables created by migrations, and trigger functions run as the caller.
-- Grant now and for every table created later.

grant usage on schema public to service_role, authenticated, anon;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to service_role, authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant select on tables to authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role, authenticated;
