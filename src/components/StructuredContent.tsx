import { MarkdownContent } from "@/components/MarkdownContent";

function isBullet(line: string) {
  return /^[•\-*]\s+/.test(line);
}

function cleanBullet(line: string) {
  return line.replace(/^[•\-*]\s+/, "").trim();
}

function isHeading(line: string) {
  return /^#{1,3}\s+/.test(line);
}

function cleanHeading(line: string) {
  return line.replace(/^#{1,3}\s+/, "").trim();
}

/**
 * Renders dashboard-edited page text with the same designed look as the
 * built-in sections: brand-bar titles + styled bullet lists.
 *
 * Block rules (matches the default-text format shown in the editor):
 * - blank line = new block
 * - `# Title` line = section title
 * - short first line + more lines below = title + body
 * - `• item` lines = bullet list
 * - anything else = paragraph (inline markdown still supported)
 */
export function StructuredContent({
  content,
  dir,
}: {
  content: string;
  dir?: "rtl" | "ltr";
}) {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div dir={dir}>
      {blocks.map((block, bi) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return null;

        let title: string | null = null;
        let rest = lines;
        const first = lines[0];

        if (isHeading(first)) {
          title = cleanHeading(first);
          rest = lines.slice(1);
        } else if (
          lines.length > 1 &&
          !isBullet(first) &&
          first.length <= 80 &&
          !/[.:؟!]$/.test(first)
        ) {
          title = first;
          rest = lines.slice(1);
        }

        const bullets = rest.filter(isBullet).map(cleanBullet);
        const paras = rest.filter((l) => !isBullet(l));

        return (
          <section key={bi} className="mb-8 last:mb-0">
            {title && (
              <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                <span className="h-5 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="min-w-0">{title}</span>
              </h2>
            )}
            {paras.map((p, i) => (
              <div key={i} className="leading-loose text-muted-foreground [&:not(:last-child)]:mb-2">
                <MarkdownContent content={p} dir={dir} />
              </div>
            ))}
            {bullets.length > 0 && (
              <ul className="space-y-2 text-muted-foreground">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <MarkdownContent content={b} dir={dir} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
