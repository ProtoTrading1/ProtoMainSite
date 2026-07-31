-- Portal project: persist one current basket per approved online customer.
-- Server functions access this table with the service role; it is deliberately
-- unavailable to browser anon/authenticated roles.
create table if not exists public.customer_account_carts (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  activity_at bigint,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint customer_account_carts_items_array check (jsonb_typeof(items) = 'array'),
  constraint customer_account_carts_line_limit check (jsonb_array_length(items) <= 250)
);

alter table public.customer_account_carts enable row level security;
revoke all on table public.customer_account_carts from anon, authenticated;
grant all on table public.customer_account_carts to service_role;

create index if not exists customer_account_carts_updated_at_idx
  on public.customer_account_carts (updated_at desc);
