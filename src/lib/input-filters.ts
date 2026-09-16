// Input sanitizers for customer-facing form fields.
// Applied via onChange to prevent invalid characters at the source.

// Letters (Arabic + Latin + accents), spaces, hyphen, apostrophe. No digits/symbols.
const NAME_RE = /[^\p{L}\p{M}\s'\-.]/gu;
export function filterName(v: string, max = 60): string {
  return v.replace(NAME_RE, "").replace(/\s{2,}/g, " ").slice(0, max);
}

// Digits only (national numbers).
export function filterDigits(v: string, max = 20): string {
  return v.replace(/\D/g, "").slice(0, max);
}

// Phone with optional leading + and digits.
export function filterPhone(v: string, max = 20): string {
  const cleaned = v.replace(/[^\d+]/g, "");
  const plus = cleaned.startsWith("+") ? "+" : "";
  return (plus + cleaned.replace(/\+/g, "")).slice(0, max);
}

// Email: strip spaces & Arabic letters; keep valid email chars.
export function filterEmail(v: string, max = 255): string {
  return v.replace(/[^\w.@+\-]/g, "").toLowerCase().slice(0, max);
}

// Integer only (>=0), returns number.
export function filterInt(v: string, opts: { min?: number; max?: number } = {}): number {
  const n = Number((v || "").replace(/\D/g, "")) || 0;
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = opts;
  return Math.min(max, Math.max(min, n));
}

// Decimal (money, ratings) with optional single dot.
export function filterDecimal(v: string, max = 12): string {
  const s = v.replace(/[^\d.]/g, "");
  const [a, ...rest] = s.split(".");
  return (rest.length ? `${a}.${rest.join("").slice(0, 4)}` : a).slice(0, max);
}

// Slug: lowercase, alphanumerics + hyphen.
export function filterSlug(v: string, max = 80): string {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").slice(0, max);
}
