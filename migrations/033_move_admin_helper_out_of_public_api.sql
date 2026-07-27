-- Target project: Proto Trading Website (portal/auth database).
-- Applied to production on 2026-07-27.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin() set schema private;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

comment on function private.is_admin() is
  'RLS-only helper. Kept outside the exposed public schema so it is not a PostgREST RPC endpoint.';
