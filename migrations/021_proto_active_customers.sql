-- Proto active customer allowlist + portal customer code / sales fields
-- Run on the main portal Supabase project (shared with trade portal auth).

CREATE TABLE IF NOT EXISTS public.proto_active_customers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code         text NOT NULL,
  name                 text NOT NULL,
  email                text NOT NULL,
  sales_last_12_months numeric(12,2) NOT NULL DEFAULT 0,
  invoice_count        integer NOT NULL DEFAULT 0,
  last_purchase_date   date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proto_active_customers_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS proto_active_customers_email_lower_idx
  ON public.proto_active_customers (lower(email));

CREATE INDEX IF NOT EXISTS proto_active_customers_account_code_idx
  ON public.proto_active_customers (account_code);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code text,
  ADD COLUMN IF NOT EXISTS sales_last_12_months numeric(12,2),
  ADD COLUMN IF NOT EXISTS invoice_count integer,
  ADD COLUMN IF NOT EXISTS last_purchase_date date;

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_unique_idx
  ON public.customers (upper(customer_code))
  WHERE customer_code IS NOT NULL AND btrim(customer_code) <> '';

ALTER TABLE public.proto_active_customers ENABLE ROW LEVEL SECURITY;
