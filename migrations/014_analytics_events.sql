-- Lightweight product/category engagement events for admin analytics
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text NOT NULL CHECK (event_type IN ('product_view', 'category_view')),
  entity_id    text,
  entity_label text,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON public.analytics_events (event_type, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role / API inserts only; no client reads via anon key
DROP POLICY IF EXISTS "analytics_events_insert" ON public.analytics_events;
CREATE POLICY "analytics_events_insert" ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "analytics_events_insert_anon" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_anon" ON public.analytics_events
  FOR INSERT TO anon
  WITH CHECK (true);
