-- Store customer-chosen delivery method and optional order notes on checkout.
-- Portal project (orders DB).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_notes text DEFAULT '';
