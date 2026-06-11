-- 013_order_workflow_status.sql  (Portal Supabase: kyodrsqnmihwoplkhwwf)
-- Four-stage order workflow timestamps for Order Requests.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_in_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;
