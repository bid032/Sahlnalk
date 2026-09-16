import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Quote,
  Code,
  Smile,
  Eye,
  Pencil,
  Sparkles,
} from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: "rtl" | "ltr";
  lang?: "ar" | "en";
  minHeight?: number;
  maxLength?: number;
};

const EMOJIS = ["🔥", "✨", "💎", "⚡", "✅", "🎉", "🚀", "💯", "⭐", "🎯", "🛡️", "📧", "📱", "💳", "🎁", "🏆", "❤️", "👑", "🌟", "💡"];

type TemplateKey = "features" | "howto" | "warranty";

const TEMPLATES: Record<"ar" | "en", Record<TemplateKey, { label: string; body: string }>> = {
  ar: {
    features: {
      label: "قالب المميزات",
      body: `## ✨ المميزات\n\n- ميزة أولى\n- ميزة ثانية\n- ميزة ثالثة\n`,
    },
    howto: {
      label: "قالب طريقة التفعيل",
      body: `## ⚡ طريقة التفعيل\n\n1. اتمم عملية الشراء\n2. هيوصلك الاشتراك على البريد خلال دقائق\n3. سجل الدخول وابدأ الاستخدام\n`,
    },
    warranty: {
      label: "قالب الضمان",
      body: `## 🛡️ الضمان والدعم\n\n- ضمان كامل طوال فترة الاشتراك\n- استبدال فوري في حالة أي مشكلة\n- دعم فني 24/7\n`,
    },
  },
  en: {
    features: {
      label: "Features template",
      body: `## ✨ Features\n\n- First feature\n- Second feature\n- Third feature\n`,
    },
    howto: {
      label: "How to activate",
      body: `## ⚡ How to activate\n\n1. Complete checkout\n2. You'll receive your subscription in minutes\n3. Sign in and start using\n`,
    },
    warranty: {
      label: "Warranty template",
      body: `## 🛡️ Warranty & Support\n\n- Full warranty for the entire plan\n- Instant replacement if any issue\n- 24/7 technical support\n`,
    },
  },
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  dir = "rtl",
  lang = "ar",
  minHeight = 180,
  maxLength = 4000,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  const isAr = lang === "ar";
  const T = {
    bold: isAr ? "عريض" : "Bold",
    italic: isAr ? "مائل" : "Italic",
    heading: isAr ? "عنوان" : "Heading",
    ul: isAr ? "قائمة" : "Bullet list",
    ol: isAr ? "قائمة مرقمة" : "Numbered list",
    quote: isAr ? "اقتباس" : "Quote",
    code: isAr ? "كود" : "Code",
    link: isAr ? "رابط" : "Link",
    emoji: isAr ? "إيموجي" : "Emoji",
    templates: isAr ? "قوالب" : "Templates",
    edit: isAr ? "تحرير" : "Edit",
    preview: isAr ? "معاينة" : "Preview",
    split: isAr ? "الاثنين" : "Split",
    linkPrompt: isAr ? "الصق الرابط" : "Paste the URL",
    linkTextPrompt: isAr ? "نص الرابط" : "Link text",
    chars: isAr ? "حرف" : "chars",
  };

  const wrap = (before: string, after = before, placeholderText = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + before.length + selected.length;
      ta.setSelectionRange(cursor, cursor);
    });
  };

  const prefixLines = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const stop = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, stop);
    const transformed = block
      .split("\n")
      .map((l, i) => (prefix === "1. " ? `${i + 1}. ${l.replace(/^(\d+\.\s|[-*]\s|>\s)/, "")}` : `${prefix}${l.replace(/^(\d+\.\s|[-*]\s|>\s)/, "")}`))
      .join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(stop);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  };

  const insertLink = () => {
    const url = window.prompt(T.linkPrompt, "https://");
    if (!url) return;
    const ta = textareaRef.current;
    const sel = ta ? value.slice(ta.selectionStart, ta.selectionEnd) : "";
    const text = sel || window.prompt(T.linkTextPrompt, isAr ? "رابط" : "link") || url;
    wrap(`[${text}](`, `${url})`, "");
  };

  const insertEmoji = (e: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + e);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onChange(value.slice(0, start) + e + value.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + e.length, start + e.length);
    });
    setEmojiOpen(false);
  };

  const insertTemplate = (key: TemplateKey) => {
    const tpl = TEMPLATES[lang][key].body;
    const glue = value && !value.endsWith("\n") ? "\n\n" : "";
    onChange(value + glue + tpl);
    setTplOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const Btn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-brand/10 hover:text-brand transition-colors"
    >
      {children}
    </button>
  );

  const chars = value.length;
  const nearLimit = chars > maxLength * 0.9;
  const over = chars > maxLength;

  return (
    <div className="border border-border rounded-xl bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-border bg-muted/30" dir={dir}>
        <Btn onClick={() => wrap("**", "**", isAr ? "نص عريض" : "bold text")} title={T.bold}>
          <Bold className="size-4" />
        </Btn>
        <Btn onClick={() => wrap("*", "*", isAr ? "نص مائل" : "italic")} title={T.italic}>
          <Italic className="size-4" />
        </Btn>
        <Btn onClick={() => prefixLines("## ")} title={T.heading}>
          <Heading2 className="size-4" />
        </Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => prefixLines("- ")} title={T.ul}>
          <List className="size-4" />
        </Btn>
        <Btn onClick={() => prefixLines("1. ")} title={T.ol}>
          <ListOrdered className="size-4" />
        </Btn>
        <Btn onClick={() => prefixLines("> ")} title={T.quote}>
          <Quote className="size-4" />
        </Btn>
        <Btn onClick={() => wrap("`", "`", "code")} title={T.code}>
          <Code className="size-4" />
        </Btn>
        <Btn onClick={insertLink} title={T.link}>
          <LinkIcon className="size-4" />
        </Btn>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Emoji */}
        <div className="relative">
          <Btn onClick={() => { setEmojiOpen((v) => !v); setTplOpen(false); }} title={T.emoji}>
            <Smile className="size-4" />
          </Btn>
          {emojiOpen && (
            <div className="absolute top-full start-0 mt-1 z-50 p-2 rounded-lg border border-border bg-popover shadow-lg grid grid-cols-5 gap-1 w-[200px] max-w-[calc(100vw-2rem)]">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="h-8 w-8 grid place-items-center text-lg hover:bg-brand/10 rounded"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Templates */}
        <div className="relative">
          <Btn onClick={() => { setTplOpen((v) => !v); setEmojiOpen(false); }} title={T.templates}>
            <Sparkles className="size-4" />
          </Btn>
          {tplOpen && (
            <div className="absolute top-full start-0 mt-1 z-50 p-1 rounded-lg border border-border bg-popover shadow-lg w-[220px] max-w-[calc(100vw-2rem)]">
              {(Object.keys(TEMPLATES[lang]) as TemplateKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => insertTemplate(k)}
                  className="w-full text-start px-3 py-2 text-sm rounded hover:bg-brand/10 hover:text-brand"
                >
                  {TEMPLATES[lang][k].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-background border border-border">
          {(["edit", "split", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 h-7 text-[11px] font-bold rounded transition-colors ${
                mode === m ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "edit" && <Pencil className="size-3.5 inline" />}
              {m === "preview" && <Eye className="size-3.5 inline" />}
              {m === "split" && <span>{T.split}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className={`grid ${mode === "split" ? "md:grid-cols-2" : "grid-cols-1"} divide-y md:divide-y-0 md:divide-x divide-border`}>
        {(mode === "edit" || mode === "split") && (
          <textarea
            ref={textareaRef}
            dir={dir}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full px-3 py-2.5 bg-background outline-none resize-y text-sm leading-relaxed font-mono"
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <div
            style={{ minHeight }}
            className="px-4 py-3 bg-muted/10 overflow-auto"
          >
            {value.trim() ? (
              <MarkdownContent content={value} dir={dir} className="text-sm" />
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">
                {isAr ? "هنا هتظهر المعاينة أثناء الكتابة..." : "Live preview will appear here..."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer: char counter */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/20 text-[11px]">
        <span className="text-muted-foreground/70">
          {isAr
            ? "يدعم Markdown: **عريض** *مائل* # عنوان - قائمة"
            : "Markdown supported: **bold** *italic* # heading - list"}
        </span>
        <span className={`font-mono tabular-nums ${over ? "text-destructive font-bold" : nearLimit ? "text-warning" : "text-muted-foreground"}`}>
          {chars}/{maxLength} {T.chars}
        </span>
      </div>
    </div>
  );
}
