-- 026_archive_no_image_products.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
--
-- One-time bulk archive: move live website_stock rows with no images to archived_products.
-- Safe to re-run — already-archived SKUs are skipped (not in website_stock).

do $$
declare
  v_sku text;
  v_count int := 0;
begin
  for v_sku in
    select ws.sku
      from public.website_stock ws
     where coalesce(nullif(btrim(ws.image_url_one), ''), null) is null
       and coalesce(nullif(btrim(ws.image_url_two), ''), null) is null
       and coalesce(nullif(btrim(ws.image_url_three), ''), null) is null
       and coalesce(nullif(btrim(ws.image_url_four), ''), null) is null
     order by ws.sku
  loop
    perform public.archive_product(v_sku, 'admin-bulk');
    v_count := v_count + 1;
  end loop;

  raise notice 'Archived % product(s) with no image', v_count;
end $$;
