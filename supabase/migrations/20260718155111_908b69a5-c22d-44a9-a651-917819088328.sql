ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.products SET category_ids = ARRAY[category_id] WHERE category_id IS NOT NULL AND (array_length(category_ids,1) IS NULL);
CREATE INDEX IF NOT EXISTS products_category_ids_gin ON public.products USING gin (category_ids);