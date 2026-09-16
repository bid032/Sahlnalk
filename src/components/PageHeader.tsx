import { Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { useBrandSetting } from "@/hooks/useSiteSetting";

/**
 * Shared mini header for static content pages (about / terms / privacy):
 * cover strip + breadcrumb + title, same visual language as home/shop.
 */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { lang } = useApp();
  const brand = useBrandSetting();
  const coverSrc = (brand.data?.cover_url ?? "").trim() || "/cover.webp";
  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
        <img
          src={coverSrc}
          alt=""
          aria-hidden
          loading="eager"
          decoding="async"
          className="h-24 w-full object-cover sm:h-32"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/55 via-[#0b3fa0]/15 to-transparent"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
          <nav
            aria-label="breadcrumb"
            className="mb-1 flex items-center gap-1.5 text-[11px] text-white/85 sm:text-xs"
          >
            <Link to="/" className="transition hover:text-white">
              {lang === "ar" ? "الرئيسية" : "Home"}
            </Link>
            <span aria-hidden>/</span>
            <span className="max-w-45 truncate font-bold text-white">{title}</span>
          </nav>
          <h1 className="text-xl font-extrabold text-white drop-shadow sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-xl text-xs text-white/85 sm:text-sm">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
