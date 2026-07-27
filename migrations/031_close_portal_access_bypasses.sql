-- Target project: Proto Trading Website (portal/auth database).
-- Applied to production on 2026-07-27.

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    (
      customer_id = (select auth.uid())
      and exists (
        select 1 from public.customers c
        where c.id = (select auth.uid()) and c.is_approved = true
      )
    )
    or public.is_admin()
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

drop policy if exists analytics_events_insert on public.analytics_events;
drop policy if exists analytics_events_insert_anon on public.analytics_events;
drop policy if exists search_analytics_insert_anon on public.search_analytics;
revoke insert, update, delete on public.analytics_events from anon, authenticated;
revoke insert, update, delete on public.search_analytics from anon, authenticated;

revoke all on function public.assign_order_number() from public, anon, authenticated;
revoke all on function public.auto_approve_pre_registered() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_customer_privileges() from public, anon, authenticated;
revoke all on function public.reject_order_workspace_timeline_update() from public, anon, authenticated;
revoke all on function public.sync_website_from_products() from public, anon, authenticated;
revoke all on function public.rpc_avg_click_position(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.rpc_search_volume_by_day(timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_searches_to_orders(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.rpc_top_searches(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.rpc_zero_order_terms(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.rpc_zero_result_terms(timestamptz, integer) from public, anon, authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

grant execute on function public.sync_website_from_products() to service_role;
grant execute on function public.rpc_avg_click_position(timestamptz, integer) to service_role;
grant execute on function public.rpc_search_volume_by_day(timestamptz) to service_role;
grant execute on function public.rpc_searches_to_orders(timestamptz, integer) to service_role;
grant execute on function public.rpc_top_searches(timestamptz, integer) to service_role;
grant execute on function public.rpc_zero_order_terms(timestamptz, integer) to service_role;
grant execute on function public.rpc_zero_result_terms(timestamptz, integer) to service_role;

alter function public.assign_order_number() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.protect_customer_privileges() set search_path = public;
alter function public.reject_order_workspace_timeline_update() set search_path = public;
