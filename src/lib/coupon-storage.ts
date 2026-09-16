/**
 * Pending coupon code saved from a product page ("apply instantly").
 * The checkout page consumes it on mount and re-validates server-side.
 */

export const PENDING_COUPON_KEY = "sahlnalk:pending_coupon";

export function getPendingCoupon(): string | null {
  try {
    const v = localStorage.getItem(PENDING_COUPON_KEY);
    const code = (v ?? "").trim().toUpperCase();
    return code ? code : null;
  } catch {
    return null;
  }
}

export function setPendingCoupon(code: string): void {
  try {
    const clean = code.trim().toUpperCase();
    if (clean) localStorage.setItem(PENDING_COUPON_KEY, clean);
  } catch {
    /* storage unavailable */
  }
}

export function clearPendingCoupon(): void {
  try {
    localStorage.removeItem(PENDING_COUPON_KEY);
  } catch {
    /* storage unavailable */
  }
}
