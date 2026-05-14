-- Proto Trading Portal — admin workflow upgrades
-- Run after 001_initial.sql and 002_portal_hardening.sql

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_items jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS final_items jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS order_match text NOT NULL DEFAULT 'order-match',
  ADD COLUMN IF NOT EXISTS order_change_notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS replacement_map jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_note text DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique_idx
  ON public.orders(order_number)
  WHERE order_number IS NOT NULL;

UPDATE public.orders
SET original_items = COALESCE(NULLIF(original_items, '[]'::jsonb), items),
    final_items = COALESCE(NULLIF(final_items, '[]'::jsonb), items)
WHERE jsonb_array_length(COALESCE(original_items, '[]'::jsonb)) = 0
   OR jsonb_array_length(COALESCE(final_items, '[]'::jsonb)) = 0;
