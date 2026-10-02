-- Draft only: not applied to production. Authenticated ingestion runs through
-- the storefront service API; no browser role can read or write this table.
create table public.shopping_events (
  event_id uuid primary key,
  event_type text not null check (event_type in ('catalogue_viewed','department_viewed','search_results_viewed','product_viewed','search_result_clicked','basket_item_added','basket_item_removed','basket_quantity_changed','checkout_started','order_submitted','search_tip_shown','search_tip_dismissed','search_tip_search_clicked','personalised_tip_shown','personalised_tip_dismissed','personalised_tip_clicked')),
  session_id uuid not null,
  customer_id uuid not null references auth.users(id) on delete cascade,
  source text check (source in ('main','instore')),
  product_id text,
  search_id uuid,
  search_term text check (length(search_term)<=200),
  results_count integer check (results_count>=0),
  main_results_count integer check (main_results_count>=0),
  instore_results_count integer check (instore_results_count>=0),
  position integer check (position>=1),
  tip_stage text check (tip_stage in ('initial','reminder','arrival')),
  quantity integer check (quantity>=0),
  order_id uuid references public.orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=2048),
  environment text not null check (environment in ('production','preview','local')),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shopping_events enable row level security;
revoke all on public.shopping_events from public, anon, authenticated, service_role;
grant select, insert on public.shopping_events to service_role;
create index shopping_events_period on public.shopping_events (created_at,customer_id);
create index shopping_events_customer_session on public.shopping_events (customer_id,session_id,created_at);
create index shopping_events_search on public.shopping_events (search_id) where search_id is not null;
create unique index shopping_events_submitted_order on public.shopping_events (environment,order_id) where event_type='order_submitted' and order_id is not null;
comment on table public.shopping_events is 'Append-only recorded shopping activity; submitted orders are verified against orders and are not paid revenue. Server-derived identity, time and environment.';
