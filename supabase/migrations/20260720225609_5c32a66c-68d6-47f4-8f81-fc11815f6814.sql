ALTER TABLE public.products ADD COLUMN IF NOT EXISTS plan_variants text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.product_plans ADD COLUMN IF NOT EXISTS plan_variant text;