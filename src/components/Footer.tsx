import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/contexts/AppContext";
import { useBrandSetting, useSiteSetting } from "@/hooks/useSiteSetting";
import { footerCategoriesQuery } from "@/lib/public-queries";
import { Phone, Mail, Facebook, Instagram, Youtube, Linkedin, BadgeCheck } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

// Brand icons not in lucide , inline SVGs
function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.6 6.9a5.7 5.7 0 0 1-3.3-1.1 5.7 5.7 0 0 1-2.3-4.1h-3.4v13.8a2.9 2.9 0 1 1-2.1-2.8v-3.5a6.4 6.4 0 1 0 5.5 6.3V9.7a9 9 0 0 0 5.6 1.9V8.1c0-.4 0-.8-.1-1.2Z" />
    </svg>
  );
}
function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.573L22.5 22h-6.844l-5.36-6.98L4.2 22H.938l8.02-9.166L.75 2h7.02l4.844 6.406L18.244 2Zm-1.2 18h1.86L7.05 4H5.09l11.955 16Z" />
    </svg>
  );
}
function DiscordIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.369A19.7 19.7 0 0 0 16.558 3a13.5 13.5 0 0 0-.62 1.27 18.3 18.3 0 0 0-5.48 0A13.5 13.5 0 0 0 9.83 3a19.7 19.7 0 0 0-3.76 1.37C2.36 9.845 1.36 15.18 1.86 20.44a19.8 19.8 0 0 0 5.99 3.02c.48-.65.9-1.34 1.27-2.06-.7-.26-1.36-.58-1.99-.95.17-.12.33-.25.49-.38 3.83 1.78 7.98 1.78 11.77 0 .16.13.32.26.49.38-.63.37-1.29.7-1.99.95.37.72.79 1.41 1.27 2.06 2.15-.7 4.16-1.72 5.99-3.02.6-6.1-.98-11.39-3.83-16.07ZM8.68 16.96c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4c1.2 0 2.17 1.08 2.15 2.4 0 1.32-.95 2.4-2.15 2.4Zm6.64 0c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4c1.2 0 2.17 1.08 2.15 2.4 0 1.32-.95 2.4-2.15 2.4Z" />
    </svg>
  );
}

const SOCIAL_DEFS = [
  { key: "facebook", label: "Facebook", Icon: Facebook },
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "tiktok", label: "TikTok", Icon: TikTokIcon },
  { key: "youtube", label: "YouTube", Icon: Youtube },
  { key: "x", label: "X", Icon: XIcon },
  { key: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { key: "discord", label: "Discord", Icon: DiscordIcon },
] as const;

export function Footer() {
  const { t, lang } = useApp();

  const brand = useBrandSetting();
  const socials = useSiteSetting<Record<string, string>>("socials");
  const contact = useSiteSetting<Record<string, string>>("contact");
  const categories = useQuery(footerCategoriesQuery());

  // Tagline comes from Dashboard , Settings , Brand. i18n text is only a
  // fallback for a brand new install where nothing was saved yet.
  const tagline =
    (
      (lang === "ar" ? brand.data?.tagline_ar : brand.data?.tagline_en) ||
      brand.data?.tagline_ar ||
      brand.data?.tagline_en ||
      ""
    ).trim() || t.footer.tagline;

  const defaultCategories = [
    { id: "1", slug: "design-tools", name_ar: "أدوات المصممين", name_en: "Design Tools" },
    { id: "2", slug: "ai-tools", name_ar: "أدوات الـ AI", name_en: "AI Tools" },
    { id: "3", slug: "essential-apps", name_ar: "برامج أساسية", name_en: "Essential Apps" },
    { id: "4", slug: "educational", name_ar: "تعليمية", name_en: "Educational" },
  ];

  const catList = categories.data && categories.data.length > 0 ? categories.data : defaultCategories;

  const rawPhone = (contact.data?.whatsapp ?? "01028463485").trim();
  const phoneDigits = rawPhone.replace(/[^\d+]/g, "");
  const phoneWa = phoneDigits.replace(/[^\d]/g, "") || "201028463485";
  const phoneDisplay = phoneWa.startsWith("20")
    ? `+20 ${phoneWa.slice(2, 5)} ${phoneWa.slice(5, 8)} ${phoneWa.slice(8)}`
    : `+${phoneWa}`;
  const email = (contact.data?.email ?? "support@sahlnalk.com").trim();

  const activeSocials = SOCIAL_DEFS.filter(({ key }) => {
    const v = socials.data?.[key];
    return typeof v === "string" && v.trim().length > 0;
  });

  return (
    <footer className="mt-10 pb-5 sm:mt-24 sm:pb-6">
      <div className="mx-auto max-w-6xl px-3 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-brand/20 bg-card shadow-md">
          {/* Profile head */}
          <div className="flex flex-col gap-3 bg-gradient-to-l from-brand/10 via-brand/5 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={(brand.data?.avatar_url ?? "").trim() || "/pp.webp"}
                alt="سهلنالك Sahlnalk"
                decoding="async"
                loading="lazy"
                className="size-12 shrink-0 rounded-full bg-white object-cover shadow ring-2 ring-brand/30 sm:size-14"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <BrandName className="text-lg font-black" />
                  <BadgeCheck className="size-4 shrink-0 text-brand" aria-hidden />
                </div>
                <p className="mt-0.5 max-w-[340px] truncate text-xs font-semibold text-muted-foreground sm:text-sm">
                  {tagline}
                </p>
              </div>
            </div>

            {activeSocials.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeSocials.map(({ key, label, Icon }) => (
                  <a
                    key={key}
                    href={socials.data![key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="grid size-9 place-items-center rounded-full border border-border/70 bg-background text-foreground transition-all hover:-translate-y-0.5 hover:border-brand hover:bg-brand hover:text-white hover:shadow-[0_8px_20px_-8px_var(--brand)] active:scale-95"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-6 border-t border-border/50 p-4 sm:p-7 md:grid-cols-3 md:gap-8">
            <div>
              <SectionHeader>{t.footer.quickLinks}</SectionHeader>
              <QuickLinks t={t} />
            </div>
            <div>
              <SectionHeader>{t.footer.categories}</SectionHeader>
              <CategoriesList categories={catList} lang={lang} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <SectionHeader>{t.footer.contact}</SectionHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1">
                <ContactRow
                  href={`https://wa.me/${phoneWa}`}
                  external
                  label="WhatsApp"
                  value={phoneDisplay}
                  tone="whatsapp"
                  icon={<WhatsAppIcon className="size-5" />}
                />
                <ContactRow
                  href={`tel:${phoneDigits}`}
                  label={lang === "ar" ? "اتصال مباشر" : "Call"}
                  value={phoneDisplay}
                  tone="brand"
                  icon={<Phone className="size-5" />}
                />
                {email && (
                  <ContactRow
                    href={`mailto:${email}`}
                    label={t.footer.emailLabel}
                    value={email}
                    tone="brand"
                    icon={<Mail className="size-5" />}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar - single row on all screens */}
      <div className="mx-auto mt-4 flex max-w-6xl flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 text-center sm:mt-5 sm:px-6">
        <p className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground sm:text-[13px]">
          © {new Date().getFullYear()} <BrandName className="text-[11px] sm:text-[13px]" />. {t.footer.rights}.
        </p>
        <span aria-hidden className="size-1 rounded-full bg-muted-foreground/50" />
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground sm:text-[13px]">
          <span>{lang === "ar" ? "تصميم وبرمجة" : "Designed & Developed by"}</span>
          <a
            href="https://bid032.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-brand/10 px-2 py-0.5 font-extrabold text-brand transition-colors hover:bg-brand hover:text-brand-foreground hover:underline"
          >
            Bido
          </a>
        </p>
      </div>
    </footer>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-brand text-sm font-extrabold mb-3 sm:mb-4 flex items-center gap-2">
      <span className="w-1.5 h-4 bg-brand rounded-full" />
      {children}
    </h3>
  );
}

function QuickLinks({ t }: { t: ReturnType<typeof useApp>["t"] }) {
  return (
    <ul className="space-y-2 sm:space-y-2.5">
      <li>
        <Link
          to="/about"
          className="text-xs sm:text-sm font-bold text-foreground/80 hover:text-brand transition-colors"
        >
          {t.footer.about}
        </Link>
      </li>
      <li>
        <Link
          to="/shop"
          className="text-xs sm:text-sm font-bold text-foreground/80 hover:text-brand transition-colors"
        >
          {t.nav.shop}
        </Link>
      </li>
      <li>
        <Link
          to="/privacy"
          className="text-xs sm:text-sm font-bold text-foreground/80 hover:text-brand transition-colors"
        >
          {t.footer.privacy}
        </Link>
      </li>
      <li>
        <Link
          to="/terms"
          className="text-xs sm:text-sm font-bold text-foreground/80 hover:text-brand transition-colors"
        >
          {t.footer.terms}
        </Link>
      </li>
    </ul>
  );
}

function CategoriesList({
  categories,
  lang,
}: {
  categories: { id: string; slug: string; name_ar: string; name_en: string }[];
  lang: "ar" | "en";
}) {
  return (
    <ul className="space-y-2 sm:space-y-2.5">
      {categories.map((c) => (
        <li key={c.id}>
          <Link
            to="/shop"
            search={{ category: c.slug }}
            className="text-xs sm:text-sm font-bold text-foreground/80 hover:text-brand transition-colors"
          >
            {lang === "ar" ? c.name_ar : c.name_en}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ContactRow({
  href,
  external,
  label,
  value,
  icon,
  tone,
}: {
  href: string;
  external?: boolean;
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "brand" | "whatsapp";
}) {
  const toneClasses =
    tone === "whatsapp"
      ? "bg-green-500/10 text-green-500 group-hover:bg-green-500 group-hover:text-white"
      : "bg-brand/10 text-brand group-hover:bg-brand group-hover:text-brand-foreground";
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 group min-w-0"
    >
      <span
        className={`size-10 shrink-0 grid place-items-center rounded-xl transition-all ${toneClasses}`}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
        <span className="text-sm font-semibold text-foreground truncate" dir="ltr">
          {value}
        </span>
      </span>
    </a>
  );
}
