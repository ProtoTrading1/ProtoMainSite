-- Run this in the STOCK Supabase SQL editor (yiqsvwajozafvalwcero)
-- Adds L3 (product type) slug column for 3-level category assignment.

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS leaf_category TEXT NOT NULL DEFAULT '';
