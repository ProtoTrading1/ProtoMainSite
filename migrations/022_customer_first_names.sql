-- Contact / first name fields for proto active allowlist + portal customers

ALTER TABLE public.proto_active_customers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS first_name text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS first_name text;

CREATE UNIQUE INDEX IF NOT EXISTS proto_active_customers_account_code_unique_idx
  ON public.proto_active_customers (account_code);
