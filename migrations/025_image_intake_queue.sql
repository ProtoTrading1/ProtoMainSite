-- 025_image_intake_queue.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- Queue for product image intake. Admin portal enqueues uploads only.
-- BLADERUNNER-PC worker reads queue + SQL Server (read-only) and writes Supabase.

create table if not exists public.image_intake_queue (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'failed')),
  source_sku         text not null,
  image_number       smallint not null default 1 check (image_number between 1 and 4),
  image_column       text not null default 'image_url_one',
  original_filename  text not null,
  content_type       text,
  staging_path       text not null,
  staging_url        text,
  error_message      text,
  sql_code           text,
  sql_title          text,
  sql_price          numeric,
  sql_onhand         numeric,
  sql_dept           text,
  product_sku        text,
  final_image_url    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  processed_at       timestamptz,
  locked_at          timestamptz,
  locked_by          text
);

create index if not exists image_intake_queue_status_created_idx
  on public.image_intake_queue (status, created_at);

alter table public.image_intake_queue enable row level security;

revoke all on public.image_intake_queue from anon, authenticated;
grant all on public.image_intake_queue to service_role;
