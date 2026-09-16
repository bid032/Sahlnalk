import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { StructuredContent } from "@/components/StructuredContent";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "الشروط والأحكام | سهلنالك" },
      {
        name: "description",
        content: "قواعد استخدام سهلنالك وشراء الاشتراكات: التسليم، الضمان، الدفع والاستخدام - مكتوبة بلغة واضحة.",
      },
      { property: "og:site_name", content: "سهلنالك" },
      { property: "og:title", content: "الشروط والأحكام | سهلنالك" },
      { property: "og:description", content: "التسليم، الضمان، الدفع والاستخدام - قواعد سهلنالك بلغة واضحة." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rapidkeyz.com/terms" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "الشروط والأحكام | سهلنالك" },
      { name: "twitter:description", content: "التسليم، الضمان، الدفع والاستخدام - قواعد سهلنالك بلغة واضحة." },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
    ],
    links: [{ rel: "canonical", href: "https://rapidkeyz.com/terms" }],
  }),
  component: TermsPage,
});


function TermsPage() {
  const { t, lang } = useApp();
  const custom = useQuery({
    queryKey: ["site-setting", "page_terms"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "page_terms").maybeSingle();
      return (data?.value ?? null) as { ar?: string; en?: string } | null;
    },
  });
  const customText = (lang === "ar" ? custom.data?.ar : custom.data?.en)?.trim();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PageHeader title={t.terms.title} />
      <main className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
        <div className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm sm:p-8">
          {customText ? (
            <StructuredContent content={customText} dir={lang === "ar" ? "rtl" : "ltr"} />
          ) : (
            <>
              <div className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                  <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                  {t.terms.welcome}
                </h2>
                <p className="leading-loose text-muted-foreground">{t.terms.welcomeBody}</p>
              </div>

              {t.terms.sections.map((s) => (
                <section key={s.h} className="mb-8 last:mb-0">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-brand-deep">
                    <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                    {s.h}
                  </h3>
                  <ul className="space-y-2 list-disc list-inside text-muted-foreground marker:text-brand">
                    {s.items.map((it) => <li key={it} className="leading-relaxed">{it}</li>)}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
