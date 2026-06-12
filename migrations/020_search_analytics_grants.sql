-- Ensure service role can read/write search analytics (admin dashboard + API).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_analytics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_action_queue TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_search_volume_by_day(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_top_searches(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_zero_result_terms(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_searches_to_orders(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_zero_order_terms(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_avg_click_position(timestamptz, int) TO service_role;
