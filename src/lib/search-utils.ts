/**
 * Search Normalization Helper
 * Provides robust Arabic & English text normalization and multi-word token matching.
 */

export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";

  return String(input)
    .toLowerCase()
    .trim()
    // Remove Arabic diacritics (Tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // Normalize Alef variations (أ, إ, آ, ٱ) -> ا
    .replace(/[أإآٱ]/g, "ا")
    // Normalize Taa Marbouta ة -> ه
    .replace(/ة/g, "ه")
    // Normalize Alef Maqsura ى -> ي
    .replace(/ى/g, "ي")
    // Replace non-alphanumeric punctuation with spaces for clean tokenization
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    // Collapse multiple whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if haystack matches the search query.
 * Supports multi-word matching (all search words must be found in target text).
 */
export function matchesSearchQuery(
  haystack: string | null | undefined,
  searchQuery: string | null | undefined
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;

  const normalizedQuery = normalizeSearchText(searchQuery);
  if (!normalizedQuery) return true;

  const normalizedHaystack = normalizeSearchText(haystack);
  if (!normalizedHaystack) return false;

  // Split search query into individual words (tokens)
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  // Check if every token is present in the normalized haystack
  return tokens.every((token) => normalizedHaystack.includes(token));
}
