-- SUPERSEDED by 010_website_stock.sql (catalogue rebuilt into website_stock with
-- dedicated subcategory_one..four columns; website_products has been wiped/retired).
-- Kept for migration-replay history — do NOT delete. Do not run against the new schema.
--
-- Run this in the STOCK Supabase SQL editor (yiqsvwajozafvalwcero)
-- Adds a subcategory column to website_products so products can be assigned
-- to a subcategory (categoryPath[1]) and the admin Excel export groups them correctly.

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT '';
