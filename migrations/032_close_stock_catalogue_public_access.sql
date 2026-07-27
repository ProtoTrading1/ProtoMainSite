-- Target project: Proto Stock Tracking (stock/catalogue database).
-- Applied to production on 2026-07-27.
-- Portal and admin server jobs use the stock service-role key.

drop policy if exists website_stock_public_read on public.website_stock;
drop policy if exists main_categories_public_read on public.main_categories;
drop policy if exists product_groups_public_read on public.product_groups;
drop policy if exists product_group_members_public_read on public.product_group_members;
drop policy if exists product_placements_public_read on public.product_placements;
drop policy if exists "authenticated can read" on public._category_import_v3;

revoke select on public.website_stock from anon, authenticated;
revoke select on public.main_categories from anon, authenticated;
revoke select on public.product_groups from anon, authenticated;
revoke select on public.product_group_members from anon, authenticated;
revoke select on public.product_placements from anon, authenticated;
revoke select on public._category_import_v3 from anon, authenticated;

revoke all on function public.archive_product(text, text) from public, anon, authenticated;
revoke all on function public.unarchive_product(text) from public, anon, authenticated;
revoke all on function public.upsert_website_product_from_stock(text) from public, anon, authenticated;
revoke all on function public.detach_archive_on_live_insert() from public, anon, authenticated;
revoke all on function public.trg_sync_product_to_website_stock() from public, anon, authenticated;
revoke all on function public.trg_upsert_website_product_from_stock() from public, anon, authenticated;

grant execute on function public.archive_product(text, text) to service_role;
grant execute on function public.unarchive_product(text) to service_role;
grant execute on function public.upsert_website_product_from_stock(text) to service_role;
