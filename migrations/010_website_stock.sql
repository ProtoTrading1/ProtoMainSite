-- 010_website_stock.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- Catalogue rebuild from Categorised_Product_Master.xlsx.
-- Creates the new single source of truth `website_stock` plus an
-- `archived_products` table, indexes, RLS, and transactional move functions.
--
-- Supersedes the old catalogue tables (website_products / products) and the
-- column-based taxonomy added in 007_stock_subcategory.sql and 009_leaf_category.sql.
-- Those old tables are wiped separately AFTER a verified backup (see
-- scripts/backup-stock-tables.mjs) and the FK pre-check below.

-- ── Live catalogue table ──────────────────────────────────────────────────────
create table if not exists public.website_stock (
  id                   uuid primary key default gen_random_uuid(),
  sku                  text unique not null,
  barcode              text not null,
  title                text not null,
  original_description text not null,
  image_url_one        text,
  image_url_two        text,
  category             text not null,
  subcategory_one      text not null,
  subcategory_two      text,
  subcategory_three    text,
  subcategory_four     text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ── Archive table (identical column set + archive metadata) ─────────────────────
create table if not exists public.archived_products (
  id                   uuid primary key default gen_random_uuid(),
  sku                  text unique not null,
  barcode              text not null,
  title                text not null,
  original_description text not null,
  image_url_one        text,
  image_url_two        text,
  category             text not null,
  subcategory_one      text not null,
  subcategory_two      text,
  subcategory_three    text,
  subcategory_four     text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  archived_at          timestamptz default now(),
  archived_by          text
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists website_stock_sku_idx          on public.website_stock (sku);
create index if not exists website_stock_barcode_idx      on public.website_stock (barcode);
create index if not exists website_stock_category_idx     on public.website_stock (category);
create index if not exists website_stock_cat_sub1_idx     on public.website_stock (category, subcategory_one);
create index if not exists archived_products_sku_idx      on public.archived_products (sku);
create index if not exists archived_products_category_idx on public.archived_products (category);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Convention: the app's stock key bypasses RLS for writes (server/admin); the
-- public read path only needs SELECT on the live catalogue. Archived rows are
-- never publicly readable.
alter table public.website_stock     enable row level security;
alter table public.archived_products enable row level security;

drop policy if exists website_stock_public_read on public.website_stock;
create policy website_stock_public_read
  on public.website_stock
  for select
  to anon, authenticated
  using (true);

-- No anon/authenticated policies on archived_products → only service role can touch it.

-- ── Transactional move functions ───────────────────────────────────────────────
-- Both run as a single statement pair inside one function call (atomic), pin the
-- search_path, and raise cleanly rather than half-completing.
create or replace function public.archive_product(p_sku text, p_by text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.website_stock where sku = p_sku) then
    raise exception 'archive_product: SKU % not found in website_stock', p_sku
      using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.archived_products where sku = p_sku) then
    raise exception 'archive_product: SKU % already archived', p_sku
      using errcode = 'unique_violation';
  end if;

  insert into public.archived_products (
    id, sku, barcode, title, original_description, image_url_one, image_url_two,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, updated_at, archived_at, archived_by
  )
  select
    id, sku, barcode, title, original_description, image_url_one, image_url_two,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, now(), now(), p_by
  from public.website_stock
  where sku = p_sku;

  delete from public.website_stock where sku = p_sku;
end;
$$;

create or replace function public.unarchive_product(p_sku text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.archived_products where sku = p_sku) then
    raise exception 'unarchive_product: SKU % not found in archived_products', p_sku
      using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.website_stock where sku = p_sku) then
    raise exception 'unarchive_product: SKU % already live', p_sku
      using errcode = 'unique_violation';
  end if;

  insert into public.website_stock (
    id, sku, barcode, title, original_description, image_url_one, image_url_two,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, updated_at
  )
  select
    id, sku, barcode, title, original_description, image_url_one, image_url_two,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, now()
  from public.archived_products
  where sku = p_sku;

  delete from public.archived_products where sku = p_sku;
end;
$$;
