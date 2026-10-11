# Just Added atomic read overlay

Based on storefront head 047874e933189b85860ef13b0b8f39d42dcffb02 and the exact contract from Proto_Admin 3e4b8c627fd23f1adfd494093c0e34099bc47f94, md/changes/just-added-atomic-release.md.

GET /api/sort-orders retains Storage-backed unrelated category/collection orders and root metadata. Only orders['collection:just-added'] is replaced by the private portal Supabase singleton public.just_added_order_state (id=true), using existing getPortalAdminClient and VITE_SUPABASE_URL/service role configuration. Reads sku_order,updated_at only; updatedAt is an opaque revision token.

A valid atomic row returns {skuOrder,updatedAt}; empty order/null revision is valid. Missing table/row, query/thrown error or malformed row returns only that entry as {skuOrder:[],updatedAt:null,unavailable:true}. Other orders survive and stale legacy Just Added is never used. Storage-wide errors retain the existing endpoint failure behaviour.

Every endpoint response declares Cache-Control:no-store. The client retains healthy sort orders for the existing 15-second TTL, does not retain unavailable responses, and Just Added rejects unavailable/missing order state for every sort/search/category/identifier path. A collection-specific Retry Just Added action reruns the request. Specials/navigation/cart/stock membership remain unchanged.

Freshness: no-store removes the former 5-second shared-cache/30-second stale policy for this endpoint. A subsequent collection load after the 15-second healthy client TTL rechecks the network; an already displayed grid is not automatically reordered at 15 seconds. Catalogue membership uses its separate unchanged stock updated_at/ETag cache. Browser fixture tests use actual elapsed 15.5 seconds and observe requests, not a clock/module simulation. Hosted no-store headers still require preview verification; full healthy paired refresh/cutover requires an isolated schema and seed. No production migration, seed, merge or promotion is included or executed.
