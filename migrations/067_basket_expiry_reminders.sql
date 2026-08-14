-- Basket expiry lifecycle and reminder delivery state.
--
-- Rollback (only after disabling the basket expiry worker):
--   drop index if exists public.customer_account_carts_expiry_idx;
--   alter table public.customer_account_carts
--     drop column if exists archived_at,
--     drop column if exists archived_items,
--     drop column if exists reminder_1d_sent_at,
--     drop column if exists reminder_3d_sent_at,
--     drop column if exists extension_used,
--     drop column if exists expires_at,
--     drop column if exists started_at;

alter table public.customer_account_carts
  add column if not exists started_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists extension_used boolean not null default false,
  add column if not exists reminder_3d_sent_at timestamptz,
  add column if not exists reminder_1d_sent_at timestamptz,
  add column if not exists archived_items jsonb not null default '[]'::jsonb,
  add column if not exists archived_at timestamptz;

alter table public.customer_account_carts
  drop constraint if exists customer_account_carts_archived_items_array;

alter table public.customer_account_carts
  add constraint customer_account_carts_archived_items_array
  check (jsonb_typeof(archived_items) = 'array');

-- Existing baskets receive one initial seven-day window from their last known
-- activity. This is the only trustworthy timestamp available before rollout.
update public.customer_account_carts
set started_at = coalesce(
      started_at,
      case when activity_at is not null then to_timestamp(activity_at / 1000.0) end,
      updated_at,
      now()
    ),
    expires_at = coalesce(
      expires_at,
      coalesce(
        case when activity_at is not null then to_timestamp(activity_at / 1000.0) end,
        updated_at,
        now()
      ) + interval '7 days'
    )
where jsonb_array_length(items) > 0;

create index if not exists customer_account_carts_expiry_idx
  on public.customer_account_carts (expires_at)
  where jsonb_array_length(items) > 0;
