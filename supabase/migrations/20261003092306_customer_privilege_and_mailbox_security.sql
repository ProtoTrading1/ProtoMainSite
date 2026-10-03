-- Portal/auth database. Apply before the matching registration endpoints.
-- Existing account approval/identity state is preserved; no mail is sent here.
alter table public.customers
  add column if not exists trade_email_verification_required boolean not null default false,
  add column if not exists trade_email_verified_at timestamptz;

create or replace function public.protect_customer_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  protected_fields text[] := array[
    'id','email','role','tier','is_approved','customer_code','tags',
    'sales_last_12_months','invoice_count','last_purchase_date',
    'application_status','application_hold_reason','application_held_at',
    'approved_at','approved_at_inferred','is_flagged','flag_reason','admin_note',
    'created_at','last_email_type','last_email_at',
    'trade_email_verification_required','trade_email_verified_at'
  ];
begin
  if request_role = 'service_role' then return new; end if;
  if request_role is null
     and session_user in ('postgres','supabase_admin','service_role')
     and current_setting('role', true) in ('none','postgres','supabase_admin','service_role') then
    return new;
  end if;
  if private.is_admin() then return new; end if;
  if exists (
    select 1 from unnest(protected_fields) as field_name
    where (to_jsonb(new)->field_name) is distinct from (to_jsonb(old)->field_name)
  ) then
    raise exception 'Account authority, identity and staff fields cannot be changed';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_customer_privileges() from public, anon, authenticated;
grant execute on function public.protect_customer_privileges() to service_role;

-- The website edits existing profiles; the admin creates profiles through its
-- service-role API. An orphan auth account must not create its own admin row.
drop policy if exists customers_insert on public.customers;
revoke insert on public.customers from anon, authenticated;

-- New self-service registrations carry this marker in server-owned app metadata.
-- Native/direct signups get unapproved defaults regardless of user_metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  insert into public.customers (
    id,email,name,phone,business_name,country,province,city,business_type,
    role,tier,is_approved,trade_email_verification_required
  ) values (
    new.id,new.email,coalesce(new.raw_user_meta_data->>'name',''),
    new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'country',new.raw_user_meta_data->>'province',
    new.raw_user_meta_data->>'city',new.raw_user_meta_data->>'business_type',
    'customer','regular',false,
    coalesce(new.raw_app_meta_data->>'trade_email_verification_required','false') = 'true'
  ) on conflict (id) do nothing;
  return new;
end;
$function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Email knowledge is never proof. The only automatic approval path is the
-- service-only callback below after successful Auth OTP verification.
drop trigger if exists trg_auto_approve_pre_registered on public.customers;
create or replace function public.auto_approve_pre_registered()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin return new; end;
$function$;
revoke all on function public.auto_approve_pre_registered() from public, anon, authenticated;
grant execute on function public.auto_approve_pre_registered() to service_role;

create or replace function public.complete_trade_email_verification(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  verified_email text;
  account public.customers%rowtype;
  legacy public.proto_active_customers%rowtype;
  should_approve boolean := false;
begin
  -- This RPC is not client-executable. Its HTTP caller must first verify the
  -- one-time token with Supabase Auth, which supplies this immutable user id.
  select lower(email) into verified_email from auth.users
  where id=p_user_id and email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verified mailbox required'; end if;
  select * into account from public.customers where id=p_user_id for update;
  if not found or lower(account.email) is distinct from verified_email then
    raise exception 'Matching trade application required';
  end if;
  if account.trade_email_verification_required is not true then
    return jsonb_build_object('verified',true,'approved',account.is_approved);
  end if;
  select * into legacy from public.proto_active_customers
  where lower(email)=verified_email and coalesce(btrim(account_code),'')<>''
  order by id limit 1;
  should_approve := found
    and coalesce(account.application_status,'pending')='pending'
    and coalesce(account.is_flagged,false)=false;
  update public.customers set
    trade_email_verified_at=coalesce(trade_email_verified_at,now()),
    is_approved=case when should_approve then true else is_approved end,
    tags=case when should_approve and not (coalesce(tags,'{}'::text[]) @> array['10000 club'])
      then array_append(coalesce(tags,'{}'::text[]),'10000 club') else tags end,
    sales_last_12_months=case when should_approve then legacy.sales_last_12_months else sales_last_12_months end,
    invoice_count=case when should_approve then legacy.invoice_count else invoice_count end,
    last_purchase_date=case when should_approve then legacy.last_purchase_date else last_purchase_date end,
    business_name=case when should_approve then coalesce(nullif(legacy.name,''),business_name) else business_name end
  where id=p_user_id returning * into account;
  return jsonb_build_object('verified',true,'approved',account.is_approved);
end;
$function$;
revoke all on function public.complete_trade_email_verification(uuid) from public, anon, authenticated;
grant execute on function public.complete_trade_email_verification(uuid) to service_role;

-- Retain the original catalogue predicate while protecting a staff-approved
-- application whose mailbox verification has not completed yet.
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
using (
  (not is_archived and exists (
    select 1 from public.customers c where c.id=(select auth.uid()) and c.is_approved=true
    and (c.trade_email_verification_required=false or c.trade_email_verified_at is not null)
  )) or private.is_admin()
);
