-- Public coupon codes applicable to a product.
-- Exposes ONLY safe-to-display columns (no usage internals) for active,
-- unexpired coupons with remaining uses. Actual discount is always
-- re-validated server-side via validate_coupon at checkout time.

CREATE OR REPLACE FUNCTION public.public_coupons_for_product(_product_id uuid)
RETURNS TABLE (
  code text,
  discount_type text,
  discount_value numeric,
  min_order_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.code, c.discount_type::text, c.discount_value, c.min_order_amount
  FROM public.coupons AS c
  WHERE c.is_active = true
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
    AND (
      c.applies_to = 'all'
      OR (_product_id IS NOT NULL AND c.product_ids @> ARRAY[_product_id])
    )
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_coupons_for_product(uuid) TO anon, authenticated;
