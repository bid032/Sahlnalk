import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { useBrandSetting } from "@/hooks/useSiteSetting";

/**
 * Unified brand wordmark. Uses `.brand-text` utility from styles.css so the
 * gradient stays consistent across every page and both light/dark themes.
 *
 * The wordmark itself comes from Dashboard , Settings , Brand (site_settings.brand),
 * so renaming the brand there renames it everywhere on the site.
 */
export function BrandName({
  className,
  as: Tag = "span",
}: {
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const { lang } = useApp();
  const brand = useBrandSetting();

  const fromSettings = (lang === "ar" ? brand.data?.name_ar : brand.data?.name_en)?.trim();
  // Fall back to the other language before the hardcoded name so a single
  // filled field still applies site-wide.
  const fallback = (brand.data?.name_en || brand.data?.name_ar || "").trim();
  const name = fromSettings || fallback || "سهلنالك";

  return (
    <Tag className={cn("brand-text", className)} dir={lang === "ar" ? "rtl" : "ltr"}>
      {name}
    </Tag>
  );
}
