-- Record the one-way customer portal welcome marker on the Portal project.
--
-- Existing customers who had already signed in before this migration are
-- backfilled from GoTrue's last_sign_in_at so they are not shown first-login
-- onboarding again. Customers who have never signed in remain NULL and will
-- be marked by the authenticated customer-profile API after their first
-- portal welcome is selected.

alter table if exists public.customers
  add column if not exists portal_welcome_seen_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'portal_welcome_seen_at'
  ) then
    update public.customers as customer
    set portal_welcome_seen_at = auth_user.last_sign_in_at
    from auth.users as auth_user
    where customer.id = auth_user.id
      and customer.portal_welcome_seen_at is null
      and auth_user.last_sign_in_at is not null;

    comment on column public.customers.portal_welcome_seen_at is
      'One-way marker for the customer portal first-login welcome; NULL until the welcome has been selected.';
  end if;
end
$$;
