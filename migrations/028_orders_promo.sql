-- Promo code fields on checkout quote requests.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2);
