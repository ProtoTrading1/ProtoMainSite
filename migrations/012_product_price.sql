-- 012_product_price.sql  (Stock Supabase project)
-- Trade price per SKU (excl. VAT), editable from admin Product Manager.

alter table public.website_stock
  add column if not exists price numeric(10,2) not null default 0;

alter table public.archived_products
  add column if not exists price numeric(10,2) not null default 0;

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
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    price, created_at, updated_at, archived_at, archived_by
  )
  select
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    price, created_at, now(), now(), p_by
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
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    price, created_at, updated_at
  )
  select
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    price, created_at, now()
  from public.archived_products
  where sku = p_sku;

  delete from public.archived_products where sku = p_sku;
end;
$$;
