-- Applied to production 2026-07-30 (MAIN/portal project).
-- One-per-customer promo enforcement must survive order deletion: the check
-- used to read the orders table, so cleaning up test orders erased the
-- redemption record and made the code reusable. Redemptions now live in
-- their own ledger, unique per (customer, code) at the DB level.
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  promo_code text not null,
  order_id uuid,
  order_number text,
  redeemed_at timestamptz not null default now()
);
create unique index if not exists promo_redemptions_customer_code
  on public.promo_redemptions (customer_id, upper(promo_code));
alter table public.promo_redemptions enable row level security;
insert into public.promo_redemptions (customer_id, promo_code, order_id, order_number, redeemed_at)
select customer_id, upper(promo_code), id, order_number, created_at
from public.orders
where promo_code is not null and customer_id is not null
on conflict do nothing;
