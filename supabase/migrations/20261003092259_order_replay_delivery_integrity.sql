-- Apply to PORTAL before deploying the corresponding storefront handler.
-- No historical backfill, queue activation, cron or email is performed here.
alter table public.orders add column if not exists checkout_request_hash text;
alter table public.orders add column if not exists checkout_notification_snapshot jsonb;

-- Preserve the immutable checkout record even if an owner can edit other order
-- columns under existing policies. Invoker rights inspect the actual DB caller.
create or replace function public.protect_order_checkout_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'INSERT' then
    if new.checkout_request_hash is not null or new.checkout_notification_snapshot is not null then
      raise exception 'Checkout snapshots are server managed' using errcode = '42501';
    end if;
  elsif new.checkout_request_hash is distinct from old.checkout_request_hash
     or new.checkout_notification_snapshot is distinct from old.checkout_notification_snapshot then
    raise exception 'Checkout snapshots are server managed' using errcode = '42501';
  end if;
  return new;
end; $$;
revoke all on function public.protect_order_checkout_snapshot() from public, anon, authenticated;
drop trigger if exists protect_order_checkout_snapshot on public.orders;
create trigger protect_order_checkout_snapshot before insert or update on public.orders
for each row execute function public.protect_order_checkout_snapshot();

alter table public.order_delivery_jobs drop constraint if exists order_delivery_jobs_source_check;
alter table public.order_delivery_jobs add constraint order_delivery_jobs_source_check
  check (source in ('storefront-v2', 'storefront-replay-v3'));
alter table public.order_delivery_jobs add column if not exists provider_key uuid default gen_random_uuid();
alter table public.order_delivery_jobs add column if not exists first_attempt_at timestamptz;
alter table public.order_delivery_jobs add column if not exists result_detail jsonb;

-- Capture and its outbox commit together. This trigger only stages rows for
-- newly captured v3 orders; migration installation itself stages no jobs.
create or replace function public.stage_checkout_order_deliveries()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.checkout_request_hash is not null and new.checkout_notification_snapshot->>'version' = '1' then
    insert into public.order_delivery_jobs(order_id, order_created_at, channel, source)
      select new.id, new.created_at, channel, 'storefront-replay-v3'
      from unnest(array['team_email', 'customer_email', 'pdf']) as channel;
  end if;
  return new;
end; $$;
revoke all on function public.stage_checkout_order_deliveries() from public, anon, authenticated;
drop trigger if exists stage_checkout_order_deliveries on public.orders;
create trigger stage_checkout_order_deliveries after insert on public.orders
for each row execute function public.stage_checkout_order_deliveries();

-- Existing gated workers select only storefront-v2. New checkout jobs are
-- claimed only for this explicitly requested order/channel, never by a scan.
create or replace function public.claim_storefront_order_delivery(p_order_id uuid, p_channel text, p_worker text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.order_delivery_jobs; o public.orders;
begin
  if p_channel not in ('team_email', 'customer_email', 'pdf') or nullif(btrim(p_worker), '') is null then
    raise exception 'Invalid delivery claim';
  end if;
  select * into o from public.orders where id = p_order_id;
  if o.checkout_request_hash is null or (o.checkout_notification_snapshot->>'version') is distinct from '1' then
    raise exception 'Order snapshot is unavailable';
  end if;
  insert into public.order_delivery_jobs(order_id, order_created_at, channel, source)
    values (o.id, o.created_at, p_channel, 'storefront-replay-v3')
    on conflict (order_id, channel) do nothing;
  select * into j from public.order_delivery_jobs where order_id = p_order_id and channel = p_channel for update;
  if j.source <> 'storefront-replay-v3' then
    return jsonb_build_object('claimed', false, 'reason', 'Historical delivery requires manual review');
  end if;
  if j.status = 'succeeded' then
    return jsonb_build_object('claimed', false, 'result', j.result_detail);
  end if;
  if j.status = 'dead' then
    return jsonb_build_object('claimed', false, 'reason', 'Delivery requires manual review');
  end if;
  if j.status = 'processing' and j.locked_at > now() - interval '90 seconds' then
    return jsonb_build_object('claimed', false, 'reason', 'Delivery is already being processed');
  end if;
  -- Provider documentation differs between 15 and 30 minute TTLs. Use a
  -- conservative twelve minute window; after an uncertain old send, never
  -- resend automatically outside that guarantee. PDF is safe to regenerate.
  if j.attempt_count >= j.max_attempts or (p_channel <> 'pdf' and j.first_attempt_at < now() - interval '12 minutes') then
    update public.order_delivery_jobs set status = 'dead', last_error = 'Delivery outcome requires manual reconciliation',
      locked_by = null, locked_at = null, updated_at = now() where id = j.id;
    return jsonb_build_object('claimed', false, 'reason', 'Delivery requires manual review');
  end if;
  update public.order_delivery_jobs set status = 'processing', attempt_count = attempt_count + 1,
    locked_by = p_worker, locked_at = now(), first_attempt_at = coalesce(first_attempt_at, now()),
    updated_at = now() where id = j.id returning * into j;
  return jsonb_build_object('claimed', true, 'providerKey', j.provider_key);
end; $$;

create or replace function public.finish_storefront_order_delivery(
  p_order_id uuid, p_channel text, p_worker text, p_succeeded boolean, p_result jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  update public.order_delivery_jobs set status = case when p_succeeded then 'succeeded' else 'retry' end,
    result_detail = p_result, provider_message_id = coalesce(p_result->>'messageId', p_result->>'emailMessageId'),
    last_error = case when p_succeeded then null else left(p_result->>'error', 1000) end,
    completed_at = case when p_succeeded then now() else null end, locked_by = null, locked_at = null, updated_at = now()
  where order_id = p_order_id and channel = p_channel and source = 'storefront-replay-v3'
    and status = 'processing' and locked_by = p_worker;
  get diagnostics n = row_count;
  return n = 1;
end; $$;

create or replace function public.order_replay_schema_readiness()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('contractVersion', 1, 'ready',
    (public.order_delivery_schema_readiness()->>'ready')::boolean
    and exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass
      and attname = 'checkout_request_hash' and not attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass
      and attname = 'checkout_notification_snapshot' and not attisdropped)
    and (select count(*) = 3 from pg_catalog.pg_attribute where attrelid = 'public.order_delivery_jobs'::regclass
      and attname in ('provider_key', 'first_attempt_at', 'result_detail') and not attisdropped)
    and to_regprocedure('public.claim_storefront_order_delivery(uuid,text,text)') is not null
    and to_regprocedure('public.finish_storefront_order_delivery(uuid,text,text,boolean,jsonb)') is not null
    and exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.orders'::regclass
      and tgname = 'protect_order_checkout_snapshot' and tgenabled = 'O')
    and exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.orders'::regclass
      and tgname = 'stage_checkout_order_deliveries' and tgenabled = 'O'));
$$;
revoke all on function public.claim_storefront_order_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finish_storefront_order_delivery(uuid, text, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.order_replay_schema_readiness() from public, anon, authenticated;
grant execute on function public.claim_storefront_order_delivery(uuid, text, text) to service_role;
grant execute on function public.finish_storefront_order_delivery(uuid, text, text, boolean, jsonb) to service_role;
grant execute on function public.order_replay_schema_readiness() to service_role;
notify pgrst, 'reload schema';
