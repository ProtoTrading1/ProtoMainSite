-- Applicant-supplied context for manual trader review and future advisory tools.
-- This field is evidence only and must never trigger automatic approval.
alter table public.customers
  add column if not exists business_description text;

alter table public.customers
  drop constraint if exists customers_business_description_length;

alter table public.customers
  add constraint customers_business_description_length
  check (
    business_description is null
    or char_length(btrim(business_description)) between 20 and 400
  );

comment on column public.customers.business_description is
  'Applicant description of what they sell, where they sell, and their typical customers; advisory evidence only.';
