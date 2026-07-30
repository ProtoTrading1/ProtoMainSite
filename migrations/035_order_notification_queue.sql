-- Durable, service-role-only order notification queue.
-- Provider delivery remains asynchronous; this table owns dispatch attempts.

create table if not exists public.order_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null
    check (channel in ('pdf', 'internal_email', 'customer_email')),
  recipient_key text not null,
  recipient_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry_wait', 'succeeded', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  replay_count integer not null default 0 check (replay_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider text,
  provider_message_id text,
  delivery_status text
    check (delivery_status in ('accepted', 'delivered', 'read', 'failed')),
  delivery_updated_at timestamptz,
  delivery_error text,
  idempotency_key text not null unique,
  last_error_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists order_notification_jobs_due_idx
  on public.order_notification_jobs (next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

create index if not exists order_notification_jobs_order_idx
  on public.order_notification_jobs (order_id, channel, created_at);

create unique index if not exists order_notification_jobs_provider_message_idx
  on public.order_notification_jobs (provider, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.order_notification_events (
  id bigint generated always as identity primary key,
  -- Nullable so a signed provider callback with an unknown message id can be
  -- retained for reconciliation instead of silently discarded.
  job_id uuid references public.order_notification_jobs(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'queued', 'claimed', 'accepted', 'delivered', 'read',
      'retry_scheduled', 'failed', 'dead_letter', 'cancelled',
      'stale_lease_released'
    )),
  attempt integer not null default 0,
  provider text,
  provider_status integer,
  provider_message_id text,
  provider_event_id text,
  event_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_notification_events_job_idx
  on public.order_notification_events (job_id, created_at);

create index if not exists order_notification_events_order_idx
  on public.order_notification_events (order_id, created_at);

create unique index if not exists order_notification_events_provider_event_idx
  on public.order_notification_events (provider, provider_event_id);

create table if not exists public.order_notification_worker_heartbeats (
  worker_id text primary key,
  status text not null default 'idle',
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.order_notification_jobs enable row level security;
alter table public.order_notification_events enable row level security;
alter table public.order_notification_worker_heartbeats enable row level security;

revoke all on public.order_notification_jobs from public, anon, authenticated;
revoke all on public.order_notification_events from public, anon, authenticated;
revoke all on public.order_notification_worker_heartbeats from public, anon, authenticated;
grant all on public.order_notification_jobs to service_role;
grant all on public.order_notification_events to service_role;
grant all on public.order_notification_worker_heartbeats to service_role;

create or replace function public.enqueue_order_notification_job(
  p_order_id uuid,
  p_channel text,
  p_recipient_key text,
  p_recipient_name text,
  p_payload jsonb,
  p_max_attempts integer,
  p_idempotency_key text
)
returns public.order_notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.order_notification_jobs;
  v_inserted boolean := false;
begin
  insert into public.order_notification_jobs (
    order_id, channel, recipient_key, recipient_name, payload,
    max_attempts, idempotency_key
  )
  values (
    p_order_id, p_channel, p_recipient_key, nullif(p_recipient_name, ''),
    coalesce(p_payload, '{}'::jsonb), greatest(1, least(coalesce(p_max_attempts, 6), 20)),
    p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning * into v_job;

  v_inserted := found;

  if not v_inserted then
    select *
      into v_job
      from public.order_notification_jobs
     where idempotency_key = p_idempotency_key;
  else
    insert into public.order_notification_events (
      job_id, order_id, event_type, attempt
    ) values (v_job.id, v_job.order_id, 'queued', 0);
  end if;

  return v_job;
end;
$$;

create or replace function public.enqueue_order_notification_batch(
  p_order_id uuid,
  p_jobs jsonb
)
returns setof public.order_notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_job public.order_notification_jobs;
  v_channel text;
  v_recipient text;
  v_key text;
  v_max_attempts integer;
  v_item_order_id uuid;
  v_row_count integer;
begin
  if p_order_id is null then
    raise exception 'notification_batch_order_id_required';
  end if;
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) = 0 then
    raise exception 'notification_batch_jobs_required';
  end if;

  -- A PL/pgSQL exception aborts this function's statement transaction, so
  -- validation or insert failure can never leave a partially enqueued batch.
  for v_item in select value from jsonb_array_elements(p_jobs)
  loop
    v_item_order_id := nullif(v_item->>'orderId', '')::uuid;
    v_channel := nullif(trim(v_item->>'channel'), '');
    v_recipient := nullif(trim(v_item->>'recipientKey'), '');
    v_key := nullif(trim(v_item->>'idempotencyKey'), '');
    v_max_attempts := coalesce((v_item->>'maxAttempts')::integer, 6);

    if v_item_order_id is distinct from p_order_id then
      raise exception 'notification_batch_order_mismatch';
    end if;
    if v_channel is null or v_channel not in ('pdf', 'internal_email', 'customer_email') then
      raise exception 'notification_batch_invalid_channel';
    end if;
    if v_recipient is null then
      raise exception 'notification_batch_recipient_required';
    end if;
    if v_key is null then
      raise exception 'notification_batch_idempotency_key_required';
    end if;
    if v_max_attempts < 1 or v_max_attempts > 20 then
      raise exception 'notification_batch_invalid_max_attempts';
    end if;

    insert into public.order_notification_jobs (
      order_id, channel, recipient_key, recipient_name, payload,
      max_attempts, idempotency_key
    ) values (
      p_order_id,
      v_channel,
      v_recipient,
      nullif(trim(v_item->>'recipientName'), ''),
      coalesce(v_item->'payload', '{}'::jsonb),
      v_max_attempts,
      v_key
    )
    on conflict (idempotency_key) do nothing
    returning * into v_job;

    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      select *
        into v_job
        from public.order_notification_jobs
       where idempotency_key = v_key;
      if v_job.order_id is distinct from p_order_id
         or v_job.channel is distinct from v_channel
         or v_job.recipient_key is distinct from v_recipient then
        raise exception 'notification_batch_idempotency_collision';
      end if;
    else
      insert into public.order_notification_events (
        job_id, order_id, event_type, attempt
      ) values (v_job.id, v_job.order_id, 'queued', 0);
    end if;

    return next v_job;
  end loop;
end;
$$;

create or replace function public.retry_order_notification_job(
  p_job_id uuid,
  p_actor text,
  p_reason text
)
returns public.order_notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.order_notification_jobs;
  v_previous_attempts integer;
  v_actor text := left(coalesce(nullif(trim(p_actor), ''), 'system'), 160);
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Manual replay requested'), 500);
begin
  select *
    into v_job
    from public.order_notification_jobs
   where id = p_job_id
   for update;

  if not found then
    raise exception 'notification_job_not_found';
  end if;
  if v_job.status not in ('dead_letter', 'retry_wait') then
    raise exception 'notification_job_not_replayable';
  end if;

  v_previous_attempts := v_job.attempt_count;

  -- A replay is a new bounded attempt generation. Resetting attempt_count
  -- gives the existing max_attempts policy a fresh budget; replay_count and
  -- immutable events retain the full history across generations.
  update public.order_notification_jobs
     set status = 'pending',
         attempt_count = 0,
         replay_count = replay_count + 1,
         next_attempt_at = now(),
         locked_at = null,
         locked_by = null,
         lease_token = null,
         lease_expires_at = null,
         completed_at = null,
         last_error_code = null,
         last_error = null,
         updated_at = now()
   where id = p_job_id
  returning * into v_job;

  insert into public.order_notification_events (
    job_id, order_id, event_type, attempt, detail
  ) values (
    v_job.id,
    v_job.order_id,
    'queued',
    0,
    jsonb_build_object(
      'manualReplay', true,
      'replayGeneration', v_job.replay_count,
      'previousAttempts', v_previous_attempts,
      'actor', v_actor,
      'reason', v_reason
    )
  );

  return v_job;
end;
$$;

create or replace function public.claim_order_notification_jobs(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 90
)
returns setof public.order_notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select j.id
      from public.order_notification_jobs j
     where j.status in ('pending', 'retry_wait')
       and j.next_attempt_at <= now()
       and j.attempt_count < j.max_attempts
     order by j.next_attempt_at, j.created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 5), 25))
  ),
  claimed as (
    update public.order_notification_jobs j
       set status = 'processing',
           attempt_count = j.attempt_count + 1,
           locked_at = now(),
           locked_by = p_worker_id,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 90), 600))),
           updated_at = now()
      from candidates c
     where j.id = c.id
    returning j.*
  ),
  audit as (
    insert into public.order_notification_events (
      job_id, order_id, event_type, attempt, detail
    )
    select c.id, c.order_id, 'claimed', c.attempt_count,
           jsonb_build_object('worker', p_worker_id)
      from claimed c
    returning job_id
  )
  select c.* from claimed c;
end;
$$;

create or replace function public.finish_order_notification_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_retryable boolean default false,
  p_provider text default null,
  p_provider_message_id text default null,
  p_provider_status integer default null,
  p_error_code text default null,
  p_error text default null,
  p_next_attempt_at timestamptz default null,
  p_retry_after_seconds integer default null
)
returns public.order_notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.order_notification_jobs;
  v_status text;
  v_delay integer;
begin
  select *
    into v_job
    from public.order_notification_jobs
   where id = p_job_id
     and status = 'processing'
     and lease_token = p_lease_token
   for update;

  if not found then
    raise exception 'notification_job_lease_mismatch';
  end if;

  v_status := case
    when p_succeeded then 'succeeded'
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry_wait'
    else 'dead_letter'
  end;

  v_delay := case v_job.attempt_count
    when 1 then 60
    when 2 then 300
    when 3 then 1200
    when 4 then 3600
    else 21600
  end;

  update public.order_notification_jobs
     set status = v_status,
         next_attempt_at = case when v_status = 'retry_wait'
           then coalesce(
             p_next_attempt_at,
             case when p_retry_after_seconds is not null
               then now() + make_interval(secs => greatest(30, least(p_retry_after_seconds, 86400)))
               else null end,
             now() + make_interval(secs => v_delay)
           )
           else next_attempt_at end,
         locked_at = null,
         locked_by = null,
         lease_token = null,
         lease_expires_at = null,
         provider = coalesce(p_provider, provider),
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         delivery_status = case
           when p_succeeded and coalesce(p_provider, provider) is not null
             then coalesce(delivery_status, 'accepted')
           else delivery_status
         end,
         delivery_updated_at = case
           when p_succeeded and coalesce(p_provider, provider) is not null
             then coalesce(delivery_updated_at, now())
           else delivery_updated_at
         end,
         last_error_code = case when p_succeeded then null else p_error_code end,
         last_error = case when p_succeeded then null else p_error end,
         completed_at = case when v_status in ('succeeded', 'dead_letter') then now() else null end,
         updated_at = now()
   where id = p_job_id
  returning * into v_job;

  insert into public.order_notification_events (
    job_id, order_id, event_type, attempt, provider, provider_status,
    provider_message_id, detail
  ) values (
    v_job.id,
    v_job.order_id,
    case
      when v_status = 'succeeded' then 'accepted'
      when v_status = 'retry_wait' then 'retry_scheduled'
      else 'dead_letter'
    end,
    v_job.attempt_count,
    p_provider,
    p_provider_status,
    p_provider_message_id,
    jsonb_strip_nulls(jsonb_build_object(
      'errorCode', p_error_code,
      'error', p_error,
      'retryable', p_retryable
    ))
  );

  return v_job;
end;
$$;

create or replace function public.requeue_stale_notification_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.order_notification_jobs
       set status = case when attempt_count < max_attempts then 'retry_wait' else 'dead_letter' end,
           next_attempt_at = case when attempt_count < max_attempts then now() else next_attempt_at end,
           locked_at = null,
           locked_by = null,
           lease_token = null,
           lease_expires_at = null,
           last_error_code = 'stale_lease',
           last_error = 'Worker lease expired before completion',
           completed_at = case when attempt_count >= max_attempts then now() else null end,
           updated_at = now()
     where status = 'processing'
       and lease_expires_at < now()
    returning id, order_id, attempt_count, status
  ),
  audit as (
    insert into public.order_notification_events (
      job_id, order_id, event_type, attempt
    )
    select id, order_id,
           case when status = 'dead_letter' then 'dead_letter' else 'stale_lease_released' end,
           attempt_count
      from stale
    returning 1
  )
  select count(*) into v_count from audit;

  return v_count;
end;
$$;

revoke all on function public.enqueue_order_notification_job(uuid, text, text, text, jsonb, integer, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_order_notification_batch(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.retry_order_notification_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_order_notification_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finish_order_notification_job(uuid, uuid, boolean, boolean, text, text, integer, text, text, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.requeue_stale_notification_jobs()
  from public, anon, authenticated;

grant execute on function public.enqueue_order_notification_job(uuid, text, text, text, jsonb, integer, text)
  to service_role;
grant execute on function public.enqueue_order_notification_batch(uuid, jsonb)
  to service_role;
grant execute on function public.retry_order_notification_job(uuid, text, text)
  to service_role;
grant execute on function public.claim_order_notification_jobs(text, integer, integer)
  to service_role;
grant execute on function public.finish_order_notification_job(uuid, uuid, boolean, boolean, text, text, integer, text, text, timestamptz, integer)
  to service_role;
grant execute on function public.requeue_stale_notification_jobs()
  to service_role;
