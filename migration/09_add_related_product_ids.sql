-- Migration script to add related_product_ids column to products table in Supabase
-- Run this script in Supabase Dashboard -> SQL Editor

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS related_product_ids text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.products.related_product_ids IS 'List of explicitly linked related product IDs';
