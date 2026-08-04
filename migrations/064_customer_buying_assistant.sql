-- Draft only. Do not apply until the paired Storefront and Admin previews are approved.
create table if not exists public.customer_buying_assistant (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  goal text not null check (goal in ('hot', 'specials', 'start', 'dismissed')),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_buying_assistant enable row level security;
revoke all on public.customer_buying_assistant from anon, authenticated;
grant select, insert, update, delete on public.customer_buying_assistant to service_role;

comment on table public.customer_buying_assistant is
  'Records only completion and the selected first-login route; never controls access, pricing or customer approval.';
