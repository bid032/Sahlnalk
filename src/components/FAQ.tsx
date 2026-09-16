import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, HelpCircle, Search, X, Store } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useApp } from "@/contexts/AppContext";
import { publicFaqsQuery } from "@/lib/public-queries";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useSiteSetting } from "@/hooks/useSiteSetting";

import { FAQ_ITEMS_AR, FAQ_ITEMS_EN, type QA } from "@/lib/faq-items";
export { FAQ_ITEMS_AR, FAQ_ITEMS_EN };


export function FAQ() {
  const { lang } = useApp();
  const isAr = lang === "ar";
  const dbFaqs = useQuery(publicFaqsQuery());
  const contact = useSiteSetting<Record<string, string>>("contact");
  const whatsapp = (contact.data?.whatsapp ?? "").replace(/[^\d]/g, "");
  const items: QA[] =
    dbFaqs.data && dbFaqs.data.length > 0
      ? dbFaqs.data.map((r) => ({
        q: lang === "ar" ? r.question_ar : r.question_en,
        a: lang === "ar" ? r.answer_ar : r.answer_en,
      }))
      : lang === "ar"
        ? FAQ_ITEMS_AR
        : FAQ_ITEMS_EN;
  const [open, setOpen] = useState<number | null>(0);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return items.map((it, i) => ({ it, i }));
    return items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => `${it.q} ${it.a}`.toLowerCase().includes(s));
  }, [items, query]);

  return (
    <section className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-20" aria-labelledby="faq-heading">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:gap-10">
        {/* ── Sticky intro column ── */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand sm:text-xs">
            <HelpCircle className="size-3.5" />
            {isAr ? "الأسئلة الشائعة" : "FAQ"}
            {items.length > 0 && (
              <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-black text-white tabular-nums">
                {items.length}
              </span>
            )}
          </div>
          <h2 id="faq-heading" className="mt-3 text-2xl font-extrabold leading-snug sm:text-4xl">
            {isAr ? (
              <>
                عندك سؤال في بالك؟
                <br />
                <span className="brand-text">دوّر هنا الأول</span>
              </>
            ) : (
              <>
                Something on your mind?
                <br />
                <span className="brand-text">Check here first</span>
              </>
            )}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {isAr ? (
              <>جمعنالك أكتر أسئلة بتتكرر عن الشراء والدفع والتسليم والضمان، بإجابات واضحة من غير لف.</>
            ) : (
              <>The questions we hear most about buying, paying, delivery and warranty — answered straight.</>
            )}
          </p>

          {/* Live search */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? "اكتب سؤالك هنا..." : "Type your question here..."}
              className="w-full rounded-full border border-border bg-card py-2.5 ps-9 pe-9 text-sm outline-none transition-colors focus:border-brand"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={isAr ? "مسح البحث" : "Clear search"}
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Help CTA */}
          <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] p-4 text-white sm:p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-8 -end-8 size-28 rounded-full bg-white/20 blur-2xl"
            />
            <p className="relative text-sm font-extrabold drop-shadow">
              {isAr ? "ملقتش إجابتك؟" : "Didn't find your answer?"}
            </p>
            <p className="relative mt-0.5 text-xs text-white/85">
              {isAr ? "ابعتنا واتساب وهنرد عليك بنفسنا" : "Text us on WhatsApp, a human replies"}
            </p>
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-[#0b3fa0] shadow-lg transition hover:brightness-95 active:scale-95 sm:text-sm"
              >
                <WhatsAppIcon className="size-4" />
                {isAr ? "كلمنا واتساب" : "WhatsApp us"}
              </a>
            ) : (
              <Link
                to="/shop"
                className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-[#0b3fa0] shadow-lg transition hover:brightness-95 active:scale-95 sm:text-sm"
              >
                <Store className="size-4" />
                {isAr ? "تصفح المتجر" : "Browse shop"}
              </Link>
            )}
          </div>
        </div>

        {/* ── Questions list ── */}
        <div>
          {query.trim() && (
            <p className="mb-3 text-xs text-muted-foreground tabular-nums">
              {isAr ? `لقينا ${visible.length} إجابة لـ "${query.trim()}"` : `${visible.length} answers for "${query.trim()}"`}
            </p>
          )}
          <div data-gsap="card-pop" className="space-y-3">
            {visible.map(({ it, i }) => {
              const isOpen = open === i;
              return (
                <div
                  key={`${i}-${it.q}`}
                  className={`group overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 ${isOpen ? "border-brand/50 brand-glow" : "border-border hover:border-brand/30"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center gap-3 p-4 text-start sm:gap-4 sm:p-5"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-black tabular-nums transition-all sm:size-10 sm:text-sm ${isOpen
                          ? "bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-white shadow-[0_10px_25px_-10px_rgba(0,169,224,0.65)]"
                          : "bg-brand/10 text-brand"
                        }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`flex-1 text-sm font-bold leading-relaxed transition-colors sm:text-base ${isOpen ? "text-brand" : "group-hover:text-brand"}`}>
                      {it.q}
                    </span>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full border transition-all duration-300 ${isOpen
                          ? "rotate-45 scale-110 border-brand bg-brand text-brand-foreground"
                          : "border-border text-muted-foreground group-hover:border-brand/50 group-hover:text-brand"
                        }`}
                      aria-hidden
                    >
                      <Plus className="size-4" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="ms-12 border-s-2 border-brand/30 px-4 pb-5 text-sm leading-loose text-muted-foreground sm:ms-[60px] sm:px-5 sm:text-[15px]">
                          <MarkdownContent content={it.a} dir={isAr ? "rtl" : "ltr"} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="text-sm font-bold">
                {isAr ? "مفيش حاجة مطابقة — جرّب كلمة تانية" : "Nothing matches — try another word"}
              </p>
              <button
                onClick={() => setQuery("")}
                className="mt-2 text-xs font-bold text-brand hover:underline"
              >
                {isAr ? "امسح البحث" : "Clear search"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
