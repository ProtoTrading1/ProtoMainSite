-- Allow multiple proto-active rows to share a 6-char account prefix (e.g. FRIEND).
-- Signup code lookup picks the highest-sales match.

DROP INDEX IF EXISTS public.proto_active_customers_account_code_unique_idx;
