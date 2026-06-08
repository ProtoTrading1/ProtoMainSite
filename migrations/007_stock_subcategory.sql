-- Run this in the STOCK Supabase SQL editor (yiqsvwajozafvalwcero)
-- Adds a subcategory column to website_products so products can be assigned
-- to a subcategory (categoryPath[1]) and the admin Excel export groups them correctly.

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT '';
