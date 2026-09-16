import { useApp } from "@/contexts/AppContext";

type Props = {
  productName: string;
  accountTypes: ("private" | "shared" | "own" | "any")[];
};

export function ProductDetails({ productName, accountTypes }: Props) {
  const { lang } = useApp();
  const isAr = lang === "ar";
  void accountTypes;

  const features = isAr
    ? [
      { title: "تفعيل فوري", desc: "استلم اشتراكك خلال دقائق من الشراء" },
      { title: "ضمان كامل", desc: "استبدال فوري طوال مدة الاشتراك" },
      { title: "خدمة أصلية", desc: "اشتراكات رسمية 100% وليست معدلة" },
      { title: "دعم فني 24/7", desc: "فريق متاح للرد على كل استفساراتك" },
    ]
    : [
      { title: "Instant Activation", desc: "Get your subscription within minutes" },
      { title: "Full Warranty", desc: "Instant replacement throughout your plan" },
      { title: "Genuine Service", desc: "100% official subscriptions, never modified" },
      { title: "24/7 Support", desc: "Team ready to answer all your questions" },
    ];

  return (
    <section className="space-y-4 sm:space-y-6">
      {/* Feature strip - home stats style */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-brand/40 sm:p-5"
          >
            <div className="mb-1 flex items-center gap-2 text-[13px] font-extrabold sm:text-sm">
              <span className="h-4 w-1 rounded-full bg-brand" />
              {f.title}
            </div>
            <div className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              {f.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Why us - home help-band style */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] p-5 text-white sm:rounded-3xl sm:p-8">
        <div className="relative">
          <p className="mb-2 text-xs font-bold text-white/85">{isAr ? "ليه تختارنا" : "Why us"}</p>
          <h3 className="mb-6 max-w-2xl text-xl font-extrabold sm:mb-8 sm:text-2xl md:text-[1.7rem]">
            {isAr
              ? `احصل على ${productName} بأفضل تجربة شراء في مصر والوطن العربي`
              : `Get ${productName} with the best buying experience in the region`}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
            {(isAr
              ? [
                { n: "01", t: "تفعيل سريع ومضمون" },
                { n: "02", t: "باقات تناسب الجميع" },
                { n: "03", t: "دعم فني مستمر" },
                { n: "04", t: "ضمان طوال فترة الاشتراك" },
              ]
              : [
                { n: "01", t: "Fast & guaranteed activation" },
                { n: "02", t: "Plans for every budget" },
                { n: "03", t: "Ongoing technical support" },
                { n: "04", t: "Full warranty during the plan" },
              ]
            ).map((it) => (
              <div key={it.n} className="border-t border-white/25 pt-4">
                <div className="mb-1.5 font-mono text-xs font-bold text-white/70">{it.n}</div>
                <div className="text-[13px] font-bold leading-snug sm:text-sm">{it.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
