-- SUPERSEDED by 010_website_stock.sql (catalogue rebuilt into website_stock with
-- dedicated subcategory_one..four columns; website_products has been wiped/retired).
-- Kept for migration-replay history — do NOT delete. Do not run against the new schema.
--
-- Run this in the STOCK Supabase SQL editor (yiqsvwajozafvalwcero)
-- Adds L3 (product type) slug column for 3-level category assignment.

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS leaf_category TEXT NOT NULL DEFAULT '';
