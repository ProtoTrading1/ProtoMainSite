-- Customer feedback captured from the product detail view.
-- Apply separately after preview approval; this file is not executed by the build.
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  product_id text,
  product_code text,
  product_label text,
  reason text not null check (reason in ('price', 'information', 'image', 'stock', 'minimum_quantity', 'other')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists customer_feedback_created_idx on public.customer_feedback(created_at desc);
create index if not exists customer_feedback_product_idx on public.customer_feedback(product_code, created_at desc);
create index if not exists customer_feedback_reason_idx on public.customer_feedback(reason, created_at desc);

alter table public.customer_feedback enable row level security;
revoke all on public.customer_feedback from anon, authenticated;
grant select, insert, delete on public.customer_feedback to service_role;
