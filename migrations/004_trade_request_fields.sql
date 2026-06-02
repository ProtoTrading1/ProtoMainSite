-- Add structured trade-request fields for onboarding
-- Run in Supabase SQL editor or via Supabase migrations

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS business_type text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_username_unique_idx
  ON public.customers (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';
