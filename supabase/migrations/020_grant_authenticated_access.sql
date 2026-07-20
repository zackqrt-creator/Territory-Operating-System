-- Fix: tables created via raw SQL (as every migration here does) don't get
-- Supabase's usual auto-grant that the Table Editor UI applies for you. Every
-- table already has RLS enabled with correctly scoped policies — that's the
-- real access-control boundary — but without this GRANT, Postgres denies the
-- request before RLS policies are even evaluated (error 42501, "permission
-- denied for table X"). This is what's safe and standard for a Supabase
-- project: broad table-level grants to anon/authenticated, with RLS doing
-- the actual per-row restriction.
--
-- The ALTER DEFAULT PRIVILEGES line makes this automatic for any table a
-- future migration creates too, so this should only ever need to run once.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
