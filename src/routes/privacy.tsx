import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { StructuredContent } from "@/components/StructuredContent";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "الاسترداد والخصوصية | سهلنالك" },
      {
        name: "description",
        content: "استرداد خلال 6 ساعات للحسابات المشتركة غير المستخدمة - وازاي بنحمي بياناتك في سهلنالك.",
      },
      { property: "og:site_name", content: "سهلنالك" },
      { property: "og:title", content: "الاسترداد والخصوصية | سهلنالك" },
      { property: "og:description", content: "امتى تسترد فلوسك، وازاي بنحمي بياناتك - باختصار ووضوح." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rapidkeyz.com/privacy" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "الاسترداد والخصوصية | سهلنالك" },
      { name: "twitter:description", content: "امتى تسترد فلوسك، وازاي بنحمي بياناتك - باختصار ووضوح." },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
    ],
    links: [{ rel: "canonical", href: "https://rapidkeyz.com/privacy" }],
  }),
  component: PrivacyPage,
});


function PrivacyPage() {
  const { t, lang } = useApp();
  const custom = useQuery({
    queryKey: ["site-setting", "page_privacy"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "page_privacy").maybeSingle();
      return (data?.value ?? null) as { ar?: string; en?: string } | null;
    },
  });
  const refundCustom = useQuery({
    queryKey: ["site-setting", "page_refund"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "page_refund").maybeSingle();
      return (data?.value ?? null) as { ar?: string; en?: string } | null;
    },
  });
  const customText = (lang === "ar" ? custom.data?.ar : custom.data?.en)?.trim();
  const refundText = (lang === "ar" ? refundCustom.data?.ar : refundCustom.data?.en)?.trim();
  const hasCustom = !!(customText || refundText);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PageHeader title={t.privacy.title} />
      <main className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
        <div className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm sm:p-8">
          {hasCustom ? (
            <div className="space-y-5">
              {(refundText || !customText) && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-brand-deep">
                    <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                    {t.privacy.refundTitle}
                  </h3>
                  <StructuredContent
                    content={refundText || t.privacy.refund.map((i) => `- ${i}`).join("\n")}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                  />
                </div>
              )}
              {(customText || !refundText) && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-brand-deep">
                    <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                    {t.privacy.privacyTitle}
                  </h3>
                  <StructuredContent
                    content={customText || t.privacy.privacy.map((i) => `- ${i}`).join("\n")}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <section className="mb-10">
                <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                  <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                  {t.privacy.refundTitle}
                </h2>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground marker:text-brand">
                  {t.privacy.refund.map((it) => <li key={it} className="leading-relaxed">{it}</li>)}
                </ul>
              </section>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                  <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
                  {t.privacy.privacyTitle}
                </h2>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground marker:text-brand">
                  {t.privacy.privacy.map((it) => <li key={it} className="leading-relaxed">{it}</li>)}
                </ul>
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
