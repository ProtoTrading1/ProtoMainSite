-- Store the customer's chosen delivery method on the order so it shows on the
-- order link (admin fulfillment view + order PDF).
-- Values: "Customer's own courier" or "Proto Trading delivers".
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method text;
