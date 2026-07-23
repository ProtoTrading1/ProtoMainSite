-- 029_auth_security_hardening.sql
-- Target project: PORTAL (Proto Trading Website — VITE_SUPABASE_URL).
--
-- Durable pieces for password-reset / account-recovery hardening:
--   1. security_rate_limits  — fixed-window counters for auth abuse protection
--   2. check_rate_limit()    — atomic increment + allow/deny decision
--   3. purge_rate_limits()   — optional housekeeping (safe to cron nightly)
--   4. revoke_user_sessions()— force-logout a user (deletes GoTrue sessions)
--
-- Idempotent. This SAME migration ships as protoportal-admin migration 051;
-- both repos' reset endpoints hit the Portal project, so apply it ONCE there —
-- running it a second time is a no-op.

-- 1. Fixed-window rate-limit counters -----------------------------------------
create table if not exists public.security_rate_limits (
  bucket        text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (bucket, window_start)
);

create index if not exists security_rate_limits_window_idx
  on public.security_rate_limits (window_start);

comment on table public.security_rate_limits is
  'Fixed-window counters for auth abuse protection (password reset, etc.). Rows are transient; safe to purge with purge_rate_limits().';

-- 2. Atomic increment + decision ----------------------------------------------
create or replace function public.check_rate_limit(
  p_bucket         text,
  p_max            integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_window_seconds is null or p_window_seconds <= 0 then
    p_window_seconds := 3600;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.security_rate_limits (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
  do update set count = public.security_rate_limits.count + 1
  returning count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_max,
    'count', v_count,
    'limit', p_max,
    'retry_after',
      greatest(0, ceil(extract(epoch from
        (v_window_start + make_interval(secs => p_window_seconds)) - now())))::int
  );
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- 3. Housekeeping --------------------------------------------------------------
create or replace function public.purge_rate_limits(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.security_rate_limits
  where window_start < now() - make_interval(secs => coalesce(p_older_than_seconds, 86400));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_rate_limits(integer) from public, anon, authenticated;
grant execute on function public.purge_rate_limits(integer) to service_role;

-- 4. Force-logout a user -------------------------------------------------------
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare v_deleted integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
