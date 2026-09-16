REVOKE EXECUTE ON FUNCTION public.recalc_order_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recalc_order_totals() FROM PUBLIC, anon, authenticated;