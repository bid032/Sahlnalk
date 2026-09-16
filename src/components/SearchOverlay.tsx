import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { matchesSearchQuery } from "@/lib/search-utils";
import { trackSearch } from "@/lib/meta-pixel";

type Result = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon_url: string | null;
};

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      const id = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const safe = term.replace(/[%,()]/g, " ");
      const { data } = await supabase
        .from("products")
        .select("id, slug, name_ar, name_en, icon_url")
        .eq("status", "active")
        .or(`name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`)
        .limit(20);
      const filtered = ((data as any[]) ?? []).filter((item) => {
        // Match by product name only (ar + en).
        const hay = `${item.name_ar} ${item.name_en}`;
        return matchesSearchQuery(hay, term);
      }).slice(0, 8);
      setResults(filtered as Result[]);
      setLoading(false);
    }, 180);
    return () => clearTimeout(handle);
  }, [q, open]);

  const submit = () => {
    const term = q.trim();
    if (!term) return;
    trackSearch(term);
    navigate({ to: "/shop", search: { q: term } as any });
    onClose();
  };

  if (!open) return null;

  const node = (
    <div
      className="fixed inset-0 z-[10001] flex items-start justify-center"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mt-[10vh] w-[92vw] max-w-2xl mx-4 origin-top animate-[searchPop_0.35s_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="relative rounded-3xl border border-border/70 bg-card shadow-[0_30px_80px_-20px_rgba(0,168,232,0.35)] overflow-hidden">
          {/* Brand glow */}
          <div className="pointer-events-none absolute -top-20 start-1/2 -translate-x-1/2 size-64 rounded-full bg-brand/20 blur-3xl" />

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="relative flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-border/60"
          >
            <Search className="size-5 text-brand shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={lang === "ar" ? "ابحث عن خدمة أو اشتراك…" : "Search services or subscriptions…"}
              className="flex-1 bg-transparent outline-none text-base sm:text-lg placeholder:text-muted-foreground"
              dir={lang === "ar" ? "rtl" : "ltr"}
            />
            {loading && <Loader2 className="size-4 text-muted-foreground animate-spin" />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="size-8 grid place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:border-brand/50 hover:text-brand active:scale-95 transition-all"
            >
              <X className="size-4" />
            </button>
          </form>

          {/* Results */}
          <div className="max-h-[55vh] overflow-y-auto">
            {q.trim() === "" ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "اكتب اسم الخدمة للبحث…" : "Type to search services…"}
              </div>
            ) : !loading && results.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "لا توجد نتائج مطابقة" : "No matching results"}
              </div>
            ) : (
              <ul className="py-2">
                {results.map((r, i) => (
                  <li
                    key={r.id}
                    className="opacity-0 animate-[fadeUp_0.35s_ease-out_forwards]"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <Link
                      to="/product/$slug"
                      params={{ slug: r.slug }}
                      onClick={onClose}
                      className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-brand/10 transition-colors"
                    >
                      {r.icon_url ? (
                        <img src={r.icon_url} alt="" className="size-10 rounded-xl object-cover border border-border shrink-0 transition-colors group-hover:border-brand/50" />
                      ) : (
                        <div className="size-10 rounded-xl bg-muted border border-border shrink-0 transition-colors group-hover:border-brand/50" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">
                          {lang === "ar" ? r.name_ar : r.name_en}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {lang === "ar" ? r.name_en : r.name_ar}
                        </div>
                      </div>
                      <ArrowRight className={`size-4 text-brand opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1 ${lang === "ar" ? "rotate-180 group-hover:-translate-x-1" : ""}`} />
                    </Link>
                  </li>
                ))}
                {results.length > 0 && (
                  <li className="px-4 sm:px-5 pt-2 pb-3">
                    <button
                      type="button"
                      onClick={submit}
                      className="w-full text-center text-xs font-bold text-brand hover:underline"
                    >
                      {lang === "ar" ? `عرض كل النتائج لـ "${q.trim()}"` : `See all results for "${q.trim()}"`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes searchPop {
          0% { opacity: 0; transform: translateY(-24px) scale(0.94) }
          60% { opacity: 1; transform: translateY(4px) scale(1.01) }
          100% { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}
