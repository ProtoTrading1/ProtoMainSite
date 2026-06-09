-- Add WhatsApp opt-in consent column to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS accept_whatsapp boolean DEFAULT NULL;
