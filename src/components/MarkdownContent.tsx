import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
  dir?: "rtl" | "ltr" | "auto";
};

/**
 * Safe markdown renderer with brand styling.
 * - No raw HTML (react-markdown strips it by default = XSS safe)
 * - GFM: tables, task lists, autolinks, strikethrough
 * - Preserves single line breaks
 */
export function MarkdownContent({ content, className = "", dir = "auto" }: Props) {
  return (
    <div
      dir={dir}
      className={`prose-content text-muted-foreground leading-relaxed ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...p }) => <h1 className="text-xl font-extrabold text-foreground mt-4 mb-2" {...p} />,
          h2: ({ node, ...p }) => <h2 className="text-lg font-extrabold text-foreground mt-4 mb-2" {...p} />,
          h3: ({ node, ...p }) => <h3 className="text-base font-bold text-foreground mt-3 mb-2" {...p} />,
          p: ({ node, ...p }) => <p className="mb-3 leading-relaxed whitespace-pre-line" {...p} />,
          strong: ({ node, ...p }) => <strong className="font-extrabold text-foreground" {...p} />,
          em: ({ node, ...p }) => <em className="italic" {...p} />,
          ul: ({ node, ...p }) => <ul className="list-disc ps-6 space-y-1.5 mb-3" {...p} />,
          ol: ({ node, ...p }) => <ol className="list-decimal ps-6 space-y-1.5 mb-3" {...p} />,
          li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
          a: ({ node, ...p }) => (
            <a
              className="text-brand font-bold underline underline-offset-4 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
              {...p}
            />
          ),
          blockquote: ({ node, ...p }) => (
            <blockquote
              className="border-s-4 border-brand/60 ps-4 py-1 my-3 italic text-foreground/80 bg-brand/5 rounded-e-lg"
              {...p}
            />
          ),
          code: ({ node, ...p }) => (
            <code className="px-1.5 py-0.5 rounded bg-muted text-brand font-mono text-[0.9em]" {...p} />
          ),
          hr: () => <hr className="my-4 border-border" />,
          table: ({ node, ...p }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-sm border-collapse" {...p} />
            </div>
          ),
          th: ({ node, ...p }) => (
            <th className="border border-border bg-muted/50 px-3 py-2 font-bold text-start" {...p} />
          ),
          td: ({ node, ...p }) => <td className="border border-border px-3 py-2" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Inline-only markdown (bold **x** / __x__, italic *x* / _x_) for places where
 * a block renderer can't go — e.g. inside a hero <p> with line-clamp.
 * Anything unmatched renders as plain text. XSS-safe: no HTML parsing, the
 * input is only ever inserted as text nodes.
 */
export function InlineMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|__[^_]+__|_[^_\n]+_)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(
        <strong key={k++} className="font-extrabold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={k++} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <Fragment>{nodes}</Fragment>;
}
