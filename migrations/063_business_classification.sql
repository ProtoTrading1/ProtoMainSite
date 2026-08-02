-- Structured applicant classification for manual review and advisory tools.
-- These fields are evidence only and must never trigger automatic approval.
alter table public.customers
  add column if not exists sales_channels text[];

alter table public.customers
  add column if not exists product_categories text[];

alter table public.customers
  drop constraint if exists customers_sales_channels_count;

alter table public.customers
  add constraint customers_sales_channels_count
  check (sales_channels is null or cardinality(sales_channels) between 1 and 20);

alter table public.customers
  drop constraint if exists customers_product_categories_count;

alter table public.customers
  add constraint customers_product_categories_count
  check (product_categories is null or cardinality(product_categories) between 1 and 20);

comment on column public.customers.sales_channels is
  'Applicant-selected ways of trading, such as retail store, online shop or market trader.';

comment on column public.customers.product_categories is
  'Applicant-selected product groups. Advisory evidence only; never an automatic approval signal.';
