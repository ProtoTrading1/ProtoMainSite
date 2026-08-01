-- Portal project: kyodrsqnmihwoplkhwwf
-- Privacy-safe customer journey events. Applying this migration records
-- nothing by itself; the service-role API is the only writer.

create table if not exists public.customer_journey_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
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
    'checkout_started',
    'checkout_validation_failed',
    'order_submit_failed',
    'order_submit_succeeded'
  )),
  journey text not null check (journey in ('registration', 'authentication', 'basket', 'checkout')),
  step text,
  outcome text,
  session_id uuid not null,
  customer_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_journey_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists customer_journey_events_created_idx
  on public.customer_journey_events (created_at desc);

create index if not exists customer_journey_events_funnel_idx
  on public.customer_journey_events (journey, event_type, created_at desc);

create index if not exists customer_journey_events_session_idx
  on public.customer_journey_events (session_id, created_at);

alter table public.customer_journey_events enable row level security;

revoke all on public.customer_journey_events from anon, authenticated;
grant select, insert, delete on public.customer_journey_events to service_role;

comment on table public.customer_journey_events is
  'Privacy-safe registration, authentication, basket and checkout funnel events. No raw customer-entered text or basket contents.';
