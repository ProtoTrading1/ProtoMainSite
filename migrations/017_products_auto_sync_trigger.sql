-- 017_products_auto_sync_trigger.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- Root cause fix: the external cron writes public.products but nothing was
-- pushing sell_price / stock_qty / available_stock to public.website_stock
-- (the table the storefront actually reads — NOT the empty legacy website_products).
--
-- Join: products.sku = website_stock.barcode (one source SKU -> many variant rows).
--
-- After this migration:
--   1. Every INSERT/UPDATE on products immediately updates matching website_stock rows.
--   2. sync_website_from_products() remains for manual / batch backfill.

-- Ensure target columns exist (idempotent).
alter table public.website_stock add column if not exists stock_qty       numeric;
alter table public.website_stock add column if not exists available_stock numeric;

-- Row-level push: one products row -> all website_stock variants sharing its barcode.
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
  return NEW;
end;
$$;

drop trigger if exists products_sync_to_website_stock on public.products;
create trigger products_sync_to_website_stock
  after insert or update of sell_price, stock_qty, available_stock
  on public.products
  for each row
  execute function public.trg_sync_product_to_website_stock();

-- Backfill any drift right now (safe to re-run).
select public.sync_website_from_products();
