import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Wrench, ShieldCheck, Zap } from "lucide-react";
import { StructuredContent } from "@/components/StructuredContent";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "من نحن | سهلنالك" },
      {
        name: "description",
        content:
          "سهلنالك متجر مصري لبيع الاشتراكات الرقمية الأصلية بالجنيه: تسليم في دقائق، ضمان حقيقي، ودعم واتساب بيرد بسرعة.",
      },
      { property: "og:site_name", content: "Sahlnalk" },
      { property: "og:title", content: "من نحن | سهلنالك" },
      {
        property: "og:description",
        content: "ليه سهلنالك؟ اشتراكات أصلية بالجنيه، تسليم في دقائق، وضمان حقيقي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rapidkeyz.com/about" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "من نحن | سهلنالك" },
      { name: "twitter:description", content: "ليه سهلنالك؟ اشتراكات أصلية بالجنيه، تسليم في دقائق، وضمان حقيقي." },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
    ],
    links: [{ rel: "canonical", href: "https://rapidkeyz.com/about" }],
  }),
  component: AboutPage,
});


function FeaturesStrip() {
  const { t } = useApp();
  const items = [
    { icon: Phone, ...t.features.support },
    { icon: Wrench, ...t.features.fullSupport },
    { icon: ShieldCheck, ...t.features.guarantee },
    { icon: Zap, ...t.features.instant },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
      {items.map((it) => (
        <div key={it.title} className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-4 text-center shadow-sm sm:p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
            <it.icon className="size-5" />
          </span>
          <h5 className="text-sm font-extrabold">{it.title}</h5>
          <p className="max-w-[200px] text-xs leading-relaxed text-muted-foreground">{it.desc}</p>
        </div>
      ))}
    </div>
  );
}

function AboutPage() {
  const { t, lang } = useApp();
  const custom = useQuery({
    queryKey: ["site-setting", "page_about"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "page_about").maybeSingle();
      return (data?.value ?? null) as { ar?: string; en?: string } | null;
    },
  });
  const customText = (lang === "ar" ? custom.data?.ar : custom.data?.en)?.trim();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PageHeader title={t.about.title} />
      <main className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
        <div className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm sm:p-8">
          {customText ? (
            <StructuredContent content={customText} dir={lang === "ar" ? "rtl" : "ltr"} />
          ) : (
            <>
              <Section title={t.about.moreTitle}>
                <p className="leading-loose text-muted-foreground">{t.about.moreBody}</p>
              </Section>
              <Section title={t.about.missionTitle}>
                <p className="leading-loose text-muted-foreground">{t.about.missionBody}</p>
              </Section>
              <Section title={t.about.valuesTitle}>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground marker:text-brand">
                  {t.about.values.map((v) => <li key={v} className="leading-relaxed">{v}</li>)}
                </ul>
              </Section>
              <Section title={t.about.whyTitle}>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground marker:text-brand">
                  {t.about.why.map((v) => <li key={v} className="leading-relaxed">{v}</li>)}
                </ul>
              </Section>
              <Section title={t.about.visionTitle}>
                <p className="leading-loose text-muted-foreground">{t.about.visionBody}</p>
              </Section>
            </>
          )}
        </div>

        <div className="mt-5 sm:mt-6">
          <FeaturesStrip />
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-brand-deep">
        <span className="h-5 w-1 rounded-full bg-brand" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}
