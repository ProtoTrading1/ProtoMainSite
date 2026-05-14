-- Proto Trading Portal — hardening improvements
-- Run after 001_initial.sql in Supabase SQL editor

-- Ensure product code stays unique so admin CSV upserts are reliable
CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique_idx ON public.products(code);

-- Optional: normalize any unexpected NULL status values before enforcing UI assumptions
UPDATE public.orders SET status = 'pending' WHERE status IS NULL OR btrim(status) = '';
