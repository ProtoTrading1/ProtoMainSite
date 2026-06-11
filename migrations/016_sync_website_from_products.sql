-- 016_sync_website_from_products.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- Pushes live price + stock from the source-of-truth `public.products`
-- (maintained by the Bladerunner sync) onto the storefront catalogue table
-- `public.website_stock`, which is what the website actually reads
-- (see api/products.js -> website_stock).
--
-- IMPORTANT schema facts confirmed against the live DB (do not assume otherwise):
--   * public.products is the source of truth: sku, sell_price, stock_qty,
--     available_stock, ... It is NEVER written by this migration.
--   * public.website_products is an EMPTY legacy table (0 rows) and is not read
--     by the storefront. It has no price column, so it is intentionally skipped.
--   * Join key is products.sku = website_stock.barcode  (NOT website_stock.sku).
--     One source product maps to many website_stock variant rows that share a
--     barcode (e.g. BASHEWS -> BASHEWS-COCOPINE, BASHEWS-SODA, ...). Every variant
--     of a barcode inherits that source product's price and stock.

-- ── Additive stock columns on the live catalogue (website_stock had none) ──────
alter table public.website_stock add column if not exists stock_qty       numeric;
alter table public.website_stock add column if not exists available_stock numeric;

-- ── Idempotent one-shot sync function ─────────────────────────────────────────
-- Returns a small JSON summary. Safe to run repeatedly: the WHERE guard means a
-- no-change run reports website_stock_updated = 0.
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
    returning ws.id
  )
  select count(*) into v_website_stock_updated from upd;

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

-- Only the server (service role) may run the sync; never anon/authenticated.
revoke all on function public.sync_website_from_products() from public, anon, authenticated;
grant execute on function public.sync_website_from_products() to service_role;
