-- Portal project: kyodrsqnmihwoplkhwwf
--
-- Live "browsing now" presence for signed-in customers. The admin dashboard
-- counts rows whose last_seen_at is inside a short freshness window; the
-- storefront refreshes its own row on a heartbeat while the tab is visible.
--
-- One row per customer (customer_id is the primary key), so the table is
-- bounded by the customer count rather than growing with traffic — an
-- append-only event log would need constant pruning to answer the same
-- question. Applying this migration records nothing by itself; the
-- service-role API is the only writer.

create table if not exists public.customer_presence (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  -- Which tab/session last checked in. Not used for counting (a customer with
  -- two tabs open is still one shopper) but makes odd readings debuggable.
  session_id uuid,
  first_seen_at timestamptz not null default now()
);

-- The only read this table serves is "how many rows are newer than X".
create index if not exists customer_presence_last_seen_idx
  on public.customer_presence (last_seen_at desc);

alter table public.customer_presence enable row level security;
revoke all on table public.customer_presence from anon, authenticated;
grant all on table public.customer_presence to service_role;

comment on table public.customer_presence is
  'Heartbeat of signed-in customers with the storefront open. One row per customer, refreshed while the tab is visible; read as a live browsing count.';
