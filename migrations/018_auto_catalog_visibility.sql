-- 018_auto_catalog_visibility.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- Business rule:
--   • In stock (available_stock > 0) → live on website_stock (auto-restore if auto-archived)
--   • Out of stock (available_stock <= 0) → archive (archived_by = 'auto-oos')
--   • Unless keep_live_when_oos = true on the row (admin override)
--
-- Does NOT touch: new-products (dormant), product-manager / recycle-bin / admin-bulk archives.

alter table public.website_stock add column if not exists keep_live_when_oos boolean not null default false;
alter table public.archived_products add column if not exists keep_live_when_oos boolean not null default false;
alter table public.archived_products add column if not exists stock_qty numeric;
alter table public.archived_products add column if not exists available_stock numeric;

-- ── archive / unarchive — copy full row including price, stock, keep flag ─────
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
    created_at, updated_at, price, stock_qty, available_stock, keep_live_when_oos,
    archived_at, archived_by
  )
  select
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, now(), price, stock_qty, available_stock, coalesce(keep_live_when_oos, false),
    now(), p_by
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
    created_at, updated_at, price, stock_qty, available_stock, keep_live_when_oos
  )
  select
    id, sku, barcode, title, original_description,
    image_url_one, image_url_two, image_url_three, image_url_four,
    category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
    created_at, now(), price, stock_qty, available_stock, coalesce(keep_live_when_oos, false)
  from public.archived_products
  where sku = p_sku;

  delete from public.archived_products where sku = p_sku;
end;
$$;

-- ── Apply visibility for one source barcode (products.sku = website_stock.barcode) ─
create or replace function public.apply_catalog_visibility_for_barcode(p_barcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soh numeric;
  v_rec record;
begin
  if p_barcode is null or btrim(p_barcode) = '' then
    return;
  end if;

  select coalesce(p.available_stock, p.stock_qty, 0)
    into v_soh
    from public.products p
   where p.sku = p_barcode;

  if not found then
    return;
  end if;

  if v_soh > 0 then
    for v_rec in
      select ap.sku
        from public.archived_products ap
       where ap.barcode = p_barcode
         and ap.archived_by = 'auto-oos'
    loop
      perform public.unarchive_product(v_rec.sku);
    end loop;
  else
    for v_rec in
      select ws.sku
        from public.website_stock ws
       where ws.barcode = p_barcode
         and coalesce(ws.keep_live_when_oos, false) = false
    loop
      perform public.archive_product(v_rec.sku, 'auto-oos');
    end loop;
  end if;
end;
$$;

-- ── Stock sync trigger: push numbers then enforce visibility ───────────────────
create or replace function public.trg_sync_product_to_website_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.website_stock ws
     set price           = NEW.sell_price,
         stock_qty       = NEW.stock_qty,
         available_stock = NEW.available_stock,
         updated_at      = now()
   where ws.barcode = NEW.sku
     and (ws.price           is distinct from NEW.sell_price
       or ws.stock_qty       is distinct from NEW.stock_qty
       or ws.available_stock is distinct from NEW.available_stock);

  perform public.apply_catalog_visibility_for_barcode(NEW.sku);
  return NEW;
end;
$$;

-- Batch visibility pass at end of manual sync
create or replace function public.sync_website_from_products()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_products_matched        integer;
  v_website_stock_rows      integer;
  v_website_stock_updated   integer;
  v_unmatched               integer;
  v_barcode                 text;
begin
  with upd as (
    update public.website_stock ws
       set price           = p.sell_price,
           stock_qty       = p.stock_qty,
           available_stock = p.available_stock,
           updated_at      = now()
      from public.products p
     where p.sku = ws.barcode
       and (ws.price           is distinct from p.sell_price
         or ws.stock_qty       is distinct from p.stock_qty
         or ws.available_stock is distinct from p.available_stock)
    returning ws.barcode
  )
  select count(*) into v_website_stock_updated from upd;

  for v_barcode in
    select distinct p.sku
      from public.products p
     where exists (select 1 from public.website_stock ws where ws.barcode = p.sku)
        or exists (
          select 1 from public.archived_products ap
           where ap.barcode = p.sku and ap.archived_by = 'auto-oos'
        )
  loop
    perform public.apply_catalog_visibility_for_barcode(v_barcode);
  end loop;

  select count(distinct p.sku) into v_products_matched
    from public.website_stock ws
    join public.products p on p.sku = ws.barcode;

  select count(*) into v_website_stock_rows
    from public.website_stock ws
    join public.products p on p.sku = ws.barcode;

  select count(*) into v_unmatched
    from public.website_stock ws
   where not exists (select 1 from public.products p where p.sku = ws.barcode);

  return json_build_object(
    'products_matched',           v_products_matched,
    'website_products_updated',   0,
    'website_stock_rows_matched', v_website_stock_rows,
    'website_stock_updated',      v_website_stock_updated,
    'unmatched_skus_count',       v_unmatched,
    'synced_at',                  now()
  );
end;
$$;

revoke all on function public.apply_catalog_visibility_for_barcode(text) from public, anon, authenticated;
grant execute on function public.apply_catalog_visibility_for_barcode(text) to service_role;

-- Apply rule to entire catalogue now
do $$
declare r record;
begin
  for r in
    select distinct bc from (
      select barcode as bc from public.website_stock
      union
      select barcode as bc from public.archived_products where archived_by = 'auto-oos'
    ) s
    where bc is not null and btrim(bc) <> ''
  loop
    perform public.apply_catalog_visibility_for_barcode(r.bc);
  end loop;
end $$;
