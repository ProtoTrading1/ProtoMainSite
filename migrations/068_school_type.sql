-- Public vs private school, captured at registration on the school-supply site.
--
-- business_type is also set to the same label so the admin dashboard's existing
-- business_type column and filter distinguish the two with no extra work; this
-- column is the clean, queryable copy.

alter table public.customers
  add column if not exists school_type text;

alter table public.customers
  drop constraint if exists customers_school_type_valid;

alter table public.customers
  add constraint customers_school_type_valid
  check (school_type is null or school_type in ('Public school', 'Private school'));

comment on column public.customers.school_type is
  'Public school or Private school, as declared at registration. Null for non-school accounts.';
