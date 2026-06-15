-- Extra onboarding details captured at sign-up and editable on the profile.
-- monthly_spend: estimated monthly spend band (text, e.g. "R5,000 – R10,000")
-- website: website URL or social media handle/link
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS monthly_spend text,
  ADD COLUMN IF NOT EXISTS website text;
