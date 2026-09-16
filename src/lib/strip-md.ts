/**
 * Strip common Markdown syntax for short/preview displays where we don't render Markdown.
 * Keeps the visible text, removes **bold**, *em*, _underline_, `code`, headings, quotes, list bullets, and links.
 */
export function stripMd(input?: string | null): string {
  if (!input) return "";
  return input
    // images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // bold/italic wrappers
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // inline code
    .replace(/`([^`]+)`/g, "$1")
    // headings / blockquotes / list markers at line start
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    // horizontal rules
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    // stray symbols
    .replace(/[~`]/g, "");
}
