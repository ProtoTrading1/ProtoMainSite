-- Website click analytics: allow the storefront's `site_clicked` event
-- (src/lib/clickAnalytics.js). Metadata stays capped at 2 KB by the existing
-- check; the API only keeps area / label / kind for clicks.
alter table public.shopping_events drop constraint if exists shopping_events_event_type_check;
alter table public.shopping_events add constraint shopping_events_event_type_check check (event_type in ('catalogue_viewed','department_viewed','search_results_viewed','product_viewed','search_result_clicked','basket_item_added','basket_item_removed','basket_quantity_changed','checkout_started','order_submitted','search_tip_shown','search_tip_dismissed','search_tip_search_clicked','personalised_tip_shown','personalised_tip_dismissed','personalised_tip_clicked','site_clicked'));
create index if not exists shopping_events_site_clicks on public.shopping_events (created_at) where event_type = 'site_clicked';
