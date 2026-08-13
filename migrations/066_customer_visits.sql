-- Portal project: kyodrsqnmihwoplkhwwf
--
-- Engagement capture: one row per browsing SESSION, plus a cart-add event.
--
-- customer_presence (065) holds one row per customer and is overwritten on
-- every beat, so it can answer "who is on the site now" but not "how many
-- browsed on Tuesday" or "how long do they stay". A visit row is opened on the
-- session's first heartbeat and its last_seen_at moves with each later beat,
-- so duration is (last_seen_at - started_at) and a day's visitors are the
-- distinct customers with a visit that day.

create table if not exists public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  -- The storefront tab's session id. Required: without it every beat would
  -- open a new visit and the averages would be meaningless.
  session_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One visit per tab session; later beats update it rather than inserting.
create unique index if not exists customer_visits_session_key
  on public.customer_visits (customer_id, session_id);

create index if not exists customer_visits_started_idx
  on public.customer_visits (started_at desc);

alter table public.customer_visits enable row level security;
revoke all on table public.customer_visits from anon, authenticated;
grant all on table public.customer_visits to service_role;

comment on table public.customer_visits is
  'One row per customer browsing session. Duration is last_seen_at - started_at; a day''s visitors are the distinct customers with a visit that day.';

-- Let the journey log record a basket add. The event list is a CHECK
-- constraint, so widening it means replacing the constraint.
alter table public.customer_journey_events
  drop constraint if exists customer_journey_events_event_type_check;

alter table public.customer_journey_events
  add constraint customer_journey_events_event_type_check
  check (event_type in (
    'registration_started',
    'registration_step_completed',
    'registration_validation_failed',
    'registration_failed',
    'registration_completed',
    'existing_email_recovery_selected',
    'login_failed',
    'login_succeeded',
    'password_reset_requested',
    'password_reset_failed',
    'password_reset_completed',
    'basket_sync_failed',
    'basket_cleared',
    'basket_restored',
    'cart_item_added',
    'checkout_started',
    'checkout_validation_failed',
    'order_submit_failed',
    'order_submit_succeeded'
  ));

-- Engagement reads this by day, for one event type at a time.
create index if not exists customer_journey_events_type_created_idx
  on public.customer_journey_events (event_type, created_at desc);
