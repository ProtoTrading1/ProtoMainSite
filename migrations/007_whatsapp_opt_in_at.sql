-- Track when a customer opted in to WhatsApp updates.
-- accept_whatsapp (006): null = not answered, true = opted in, false = declined.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz DEFAULT NULL;
