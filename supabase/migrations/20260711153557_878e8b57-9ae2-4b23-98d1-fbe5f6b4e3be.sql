
-- Add cover_url column already exists (icon_url + cover_url both exist). No-op.

-- Testimonial images table
CREATE TABLE public.testimonial_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.testimonial_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonial_images TO authenticated;
GRANT ALL ON public.testimonial_images TO service_role;

ALTER TABLE public.testimonial_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active testimonial images"
  ON public.testimonial_images FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage testimonial images"
  ON public.testimonial_images FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage policies for product-images and testimonial-images buckets
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Admins upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read testimonial images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'testimonial-images');

CREATE POLICY "Admins upload testimonial images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update testimonial images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete testimonial images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));
