// PostgREST returns `delivered_accounts` as a single object (not an array) when
// the relationship is detected as one-to-one, which silently broke every
// consumer that assumed an array (admin orders, customer dashboard, emails).
// Always normalise through this helper.
export function deliveredList(value: unknown): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
