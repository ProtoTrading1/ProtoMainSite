-- 019_search_analytics.sql  (Proto Trading Website — kyodrsqnmihwoplkhwwf)
-- Search analytics tables + RPCs for admin Search Analytics dashboard (View Two).

CREATE TABLE IF NOT EXISTS public.search_analytics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  customer_id             uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_email          text,
  session_id              text NOT NULL,
  search_term             text NOT NULL,
  normalized_search_term  text NOT NULL,
  results_found           integer NOT NULL DEFAULT 0,
  search_position_clicked integer,
  clicked_product_sku     text,
  time_to_click_ms        integer,
  search_filter_applied   text[],
  refinement_of_search_id uuid REFERENCES public.search_analytics(id) ON DELETE SET NULL,
  added_to_cart           boolean NOT NULL DEFAULT false,
  order_created           boolean NOT NULL DEFAULT false,
  order_number            text,
  order_value             numeric(10,2)
);

CREATE TABLE IF NOT EXISTS public.search_action_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  search_term     text NOT NULL,
  flag_reason     text NOT NULL CHECK (flag_reason IN ('zero_results', 'zero_sales')),
  search_count    integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  assigned_to     text,
  notes           text,
  resolved_at     timestamptz,
  UNIQUE (search_term, flag_reason)
);

CREATE INDEX IF NOT EXISTS idx_sa_normalized_term   ON public.search_analytics(normalized_search_term);
CREATE INDEX IF NOT EXISTS idx_sa_session           ON public.search_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_sa_customer          ON public.search_analytics(customer_id);
CREATE INDEX IF NOT EXISTS idx_sa_created_at        ON public.search_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_results_found     ON public.search_analytics(results_found);
CREATE INDEX IF NOT EXISTS idx_sa_order_created     ON public.search_analytics(order_created);
CREATE INDEX IF NOT EXISTS idx_sa_refinement        ON public.search_analytics(refinement_of_search_id);
CREATE INDEX IF NOT EXISTS idx_saq_status           ON public.search_action_queue(status);

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_action_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_analytics_insert_anon" ON public.search_analytics;
CREATE POLICY "search_analytics_insert_anon"
  ON public.search_analytics FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "search_action_queue_service" ON public.search_action_queue;
CREATE POLICY "search_action_queue_service"
  ON public.search_action_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── RPC: search volume by day ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_search_volume_by_day(p_start timestamptz DEFAULT NULL)
RETURNS TABLE(day date, search_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('day', created_at)::date AS day, count(*)::bigint
    FROM search_analytics
   WHERE p_start IS NULL OR created_at >= p_start
   GROUP BY 1
   ORDER BY 1;
$$;

-- ─── RPC: top searches ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_top_searches(p_start timestamptz DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE(
  normalized_search_term text,
  searches bigint,
  orders bigint,
  conversion numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    normalized_search_term,
    count(*)::bigint AS searches,
    sum(CASE WHEN order_created THEN 1 ELSE 0 END)::bigint AS orders,
    round(
      sum(CASE WHEN order_created THEN 1 ELSE 0 END)::numeric / nullif(count(*), 0) * 100,
      1
    ) AS conversion
  FROM search_analytics
  WHERE p_start IS NULL OR created_at >= p_start
  GROUP BY normalized_search_term
  ORDER BY searches DESC
  LIMIT greatest(p_limit, 1);
$$;

-- ─── RPC: zero result terms ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_zero_result_terms(p_start timestamptz DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(normalized_search_term text, search_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT normalized_search_term, count(*)::bigint AS search_count
    FROM search_analytics
   WHERE results_found = 0
     AND (p_start IS NULL OR created_at >= p_start)
   GROUP BY normalized_search_term
   ORDER BY search_count DESC
   LIMIT greatest(p_limit, 1);
$$;

-- ─── RPC: searches leading to orders ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_searches_to_orders(p_start timestamptz DEFAULT NULL, p_limit int DEFAULT 30)
RETURNS TABLE(
  normalized_search_term text,
  searches bigint,
  orders bigint,
  conversion numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    normalized_search_term,
    count(*)::bigint AS searches,
    sum(CASE WHEN order_created THEN 1 ELSE 0 END)::bigint AS orders,
    round(
      sum(CASE WHEN order_created THEN 1 ELSE 0 END)::numeric / nullif(count(*), 0) * 100,
      1
    ) AS conversion
  FROM search_analytics
  WHERE p_start IS NULL OR created_at >= p_start
  GROUP BY normalized_search_term
  HAVING sum(CASE WHEN order_created THEN 1 ELSE 0 END) > 0
  ORDER BY orders DESC
  LIMIT greatest(p_limit, 1);
$$;

-- ─── RPC: zero-order terms (high volume, no sales) ───────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_zero_order_terms(p_start timestamptz DEFAULT NULL, p_limit int DEFAULT 30)
RETURNS TABLE(normalized_search_term text, searches bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    normalized_search_term,
    count(*)::bigint AS searches
  FROM search_analytics
  WHERE p_start IS NULL OR created_at >= p_start
  GROUP BY normalized_search_term
  HAVING sum(CASE WHEN order_created THEN 1 ELSE 0 END) = 0
  ORDER BY searches DESC
  LIMIT greatest(p_limit, 1);
$$;

-- ─── RPC: avg click position ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_avg_click_position(p_start timestamptz DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE(
  normalized_search_term text,
  avg_position numeric,
  clicks bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    normalized_search_term,
    round(avg(search_position_clicked)::numeric, 1) AS avg_position,
    count(*)::bigint AS clicks
  FROM search_analytics
  WHERE search_position_clicked IS NOT NULL
    AND (p_start IS NULL OR created_at >= p_start)
  GROUP BY normalized_search_term
  ORDER BY clicks DESC
  LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.rpc_search_volume_by_day(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_top_searches(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_zero_result_terms(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_searches_to_orders(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_zero_order_terms(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_avg_click_position(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_search_volume_by_day(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_top_searches(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_zero_result_terms(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_searches_to_orders(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_zero_order_terms(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_avg_click_position(timestamptz, int) TO service_role;
