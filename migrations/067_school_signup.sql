-- School registration (schools.proto.co.za — the standalone `schools/` site).
--
-- Schools sign up on their own site but land in the SAME customers table as
-- trade applicants, flagged so the admin dashboard can badge and filter them.
-- Like every other signup path: never auto-approved, never auto-coded.

alter table public.customers
  add column if not exists is_school boolean not null default false;

alter table public.customers
  add column if not exists school_role text;

alter table public.customers
  add column if not exists supply_needs text[];

alter table public.customers
  drop constraint if exists customers_supply_needs_count;

alter table public.customers
  add constraint customers_supply_needs_count
  check (supply_needs is null or cardinality(supply_needs) between 0 and 20);

-- Customer Management filters schools out of the regular trade list, so the
-- flag is worth an index even though the table is small today.
create index if not exists customers_is_school_idx
  on public.customers (is_school)
  where is_school;

comment on column public.customers.is_school is
  'True when the account registered through the school-supply site. Drives the SCHOOL badge in the admin dashboard.';

comment on column public.customers.school_role is
  'The registering person''s role at the school, e.g. Procurement officer. Free text — schools describe themselves differently.';

comment on column public.customers.supply_needs is
  'Supply categories the school said it is interested in. Advisory only; never an automatic approval signal.';
