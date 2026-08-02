-- Preserve the old Proto customer code supplied during a new trade application.
-- This is review evidence only. It is deliberately separate from customer_code,
-- which remains the manually allocated code for the approved online account.

alter table public.customers
  add column if not exists claimed_customer_code text;

comment on column public.customers.claimed_customer_code is
  'Old Proto code claimed by the applicant for staff reconciliation; never grants access.';

alter table public.customers
  drop constraint if exists customers_claimed_customer_code_format;

alter table public.customers
  add constraint customers_claimed_customer_code_format
  check (
    claimed_customer_code is null
    or claimed_customer_code ~ '^[A-Z0-9]{1,12}$'
  );
