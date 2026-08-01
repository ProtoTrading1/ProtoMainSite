-- 058_order_delivery_safety.sql
-- Target project: PORTAL (Proto Trading Website — VITE_SUPABASE_URL).
--
-- ROLLOUT GATE: apply this migration before releasing code that calls
-- order_delivery_schema_readiness(). Applying it does not enqueue, claim,
-- process, or resend any order. The queue remains inert until BOTH storefront
-- environment gates are enabled and a separately reviewed worker is deployed.

create table if not exists public.order_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_created_at timestamptz not null,
  channel text not null check (channel in ('team_email', 'customer_email', 'pdf')),
  source text not null default 'storefront-v2' check (source = 'storefront-v2'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'succeeded', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 12),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  provider_message_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, channel)
);

create index if not exists order_delivery_jobs_due_idx
  on public.order_delivery_jobs (available_at, created_at)
  where status in ('pending', 'retry', 'processing');

create index if not exists order_delivery_jobs_dead_idx
  on public.order_delivery_jobs (updated_at desc)
  where status = 'dead';

alter table public.order_delivery_jobs enable row level security;
revoke all on table public.order_delivery_jobs from public, anon, authenticated;
grant select, insert, update on table public.order_delivery_jobs to service_role;

comment on table public.order_delivery_jobs is
  'Disabled-by-default delivery retry ledger. Contains only explicitly enqueued post-activation storefront orders; never populated by migration/backfill.';

create or replace function public.order_delivery_schema_readiness()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with checks as (
    select
      exists (
        select 1
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on c.oid = a.attrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'orders'
          and a.attname = 'client_ref'
          and a.attnum > 0
          and not a.attisdropped
      ) as client_ref_column,
      exists (
        select 1
        from pg_catalog.pg_index i
        join pg_catalog.pg_class c on c.oid = i.indrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid = c.oid
        where n.nspname = 'public'
          and c.relname = 'orders'
          and a.attname = 'client_ref'
          and i.indisunique
          and a.attnum = any(i.indkey::smallint[])
      ) as client_ref_unique,
      to_regclass('public.order_delivery_jobs') is not null as queue_table
  )
  select jsonb_build_object(
    'contractVersion', 1,
    'ready', client_ref_column and client_ref_unique,
    'clientRefColumn', client_ref_column,
    'clientRefUnique', client_ref_unique,
    'queueReady', queue_table
      and has_table_privilege('service_role', 'public.order_delivery_jobs', 'SELECT,INSERT,UPDATE'),
    'reason', case
      when not client_ref_column then 'orders.client_ref is missing'
      when not client_ref_unique then 'orders.client_ref unique index is missing'
      when not queue_table then 'order delivery queue is not installed'
      else null
    end
  )
  from checks;
$$;

revoke all on function public.order_delivery_schema_readiness() from public, anon, authenticated;
grant execute on function public.order_delivery_schema_readiness() to service_role;

-- Atomically lease due jobs. A stale lease may be recovered after ten minutes.
-- The activation timestamp is mandatory and excludes every earlier order.
create or replace function public.claim_order_delivery_jobs(
  p_worker text,
  p_activation_at timestamptz,
  p_limit integer default 10
)
returns setof public.order_delivery_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_activation_at is null or nullif(btrim(p_worker), '') is null then
    raise exception 'worker and activation timestamp are required';
  end if;

  return query
  with due as (
    select j.id
    from public.order_delivery_jobs j
    where j.source = 'storefront-v2'
      and j.order_created_at >= p_activation_at
      and j.attempt_count < j.max_attempts
      and (
        (j.status in ('pending', 'retry') and j.available_at <= now())
        or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes')
      )
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.order_delivery_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      locked_at = now(),
      locked_by = left(p_worker, 120),
      updated_at = now()
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

create or replace function public.complete_order_delivery_job(
  p_job_id uuid,
  p_worker text,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.order_delivery_jobs
  set status = 'succeeded',
      provider_message_id = nullif(left(coalesce(p_provider_message_id, ''), 500), ''),
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = p_worker;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_order_delivery_job(
  p_job_id uuid,
  p_worker text,
  p_error text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_status text;
begin
  update public.order_delivery_jobs
  set status = case when attempt_count >= max_attempts then 'dead' else 'retry' end,
      available_at = case
        when attempt_count >= max_attempts then available_at
        else now() + make_interval(secs => least(21600, (30 * power(2, greatest(attempt_count - 1, 0)))::integer))
      end,
      last_error = left(coalesce(p_error, 'Delivery worker failed'), 1000),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = p_worker
  returning status into next_status;
  return next_status;
end;
$$;

revoke all on function public.claim_order_delivery_jobs(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.complete_order_delivery_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_order_delivery_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_order_delivery_jobs(text, timestamptz, integer) to service_role;
grant execute on function public.complete_order_delivery_job(uuid, text, text) to service_role;
grant execute on function public.fail_order_delivery_job(uuid, text, text) to service_role;

-- Deliberately absent: trigger, historical INSERT...SELECT, cron, or worker.
-- Those omissions are the guarantee that applying this migration alone cannot
-- replay an existing order or send a notification.
