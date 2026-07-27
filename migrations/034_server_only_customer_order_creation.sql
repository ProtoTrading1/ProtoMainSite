-- Customer orders must be created by the verified server-side checkout API.
-- Admins retain their existing orders_admin policy for operational changes.
DROP POLICY IF EXISTS orders_insert ON public.orders;
