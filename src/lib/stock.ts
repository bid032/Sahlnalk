// Unified stock helpers used across the site so every surface
// (home, shop, category rows, product page, quick buy) computes
// stock and sold-out state the same way.

export type PlanLike = {
  id?: string;
  price?: number | string | null;
  stock?: number | string | null;
  is_active?: boolean | null;
};

export function planStock(pl: PlanLike | null | undefined): number {
  const n = Number(pl?.stock ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function isPlanSoldOut(pl: PlanLike | null | undefined): boolean {
  return planStock(pl) <= 0;
}

export function activePlans<T extends PlanLike>(plans: T[] | null | undefined): T[] {
  return (plans ?? []).filter((p) => p?.is_active !== false);
}

export function inStockPlans<T extends PlanLike>(plans: T[] | null | undefined): T[] {
  return activePlans(plans).filter((p) => planStock(p) > 0);
}

export function totalStockOf(plans: PlanLike[] | null | undefined): number {
  return activePlans(plans).reduce((s, p) => s + planStock(p), 0);
}

export function isProductSoldOut(plans: PlanLike[] | null | undefined): boolean {
  return totalStockOf(plans) <= 0;
}

// Pick the cheapest in-stock plan (falling back to cheapest overall
// so we still surface a minimum price on sold-out cards).
export function cheapestPlan<T extends PlanLike>(plans: T[] | null | undefined): T | null {
  const act = activePlans(plans);
  if (act.length === 0) return null;
  const priced = [...act].sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
  const cheapestInStock = priced.find((p) => planStock(p) > 0);
  return cheapestInStock ?? priced[0] ?? null;
}
