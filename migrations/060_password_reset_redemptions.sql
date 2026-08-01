-- 060_password_reset_redemptions.sql
-- Target project: PORTAL (Proto Trading Website — VITE_SUPABASE_URL).
-- Draft only until explicitly approved and applied before the matching API is released.

create table if not exists public.password_reset_redemptions (
  token_hash  text primary key,
  user_id     uuid not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz not null default now()
);

alter table public.password_reset_redemptions enable row level security;
revoke all on table public.password_reset_redemptions from public, anon, authenticated;
grant all on table public.password_reset_redemptions to service_role;

create index if not exists password_reset_redemptions_expiry_idx
  on public.password_reset_redemptions (expires_at);

create or replace function public.consume_password_reset_token(
  p_token_hash text,
  p_user_id uuid,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer;
begin
  if p_token_hash is null or length(p_token_hash) <> 64
    or p_user_id is null or p_expires_at is null or p_expires_at <= now() then
    return false;
  end if;

  insert into public.password_reset_redemptions (token_hash, user_id, expires_at)
  values (p_token_hash, p_user_id, p_expires_at)
  on conflict (token_hash) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.consume_password_reset_token(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_password_reset_token(text, uuid, timestamptz)
  to service_role;
