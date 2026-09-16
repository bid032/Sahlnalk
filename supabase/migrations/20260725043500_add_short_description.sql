-- Add short_description fields to products table
ALTER TABLE public.products
ADD COLUMN short_description_ar TEXT,
ADD COLUMN short_description_en TEXT;

-- Update RLS policies to allow access to the new fields
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Update existing policies to include the new fields
CREATE OR REPLACE POLICY "Anyone views active products"
ON public.products FOR SELECT
USING (status = 'active' OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE POLICY "Admins manage products"
ON public.products FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));