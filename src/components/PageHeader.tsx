import { Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { useBrandSetting } from "@/hooks/useSiteSetting";

/**
 * Shared mini header for static content pages (about / terms / privacy):
 * cover strip + breadcrumb + title, same visual language as home/shop.
 */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { lang } = useApp();
  return (
    <div className="mx-auto w-full max-w-[94rem] px-3 sm:px-6">
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 28%), radial-gradient(circle at 60% 15%, rgba(255,255,255,.2) 0, transparent 25%)",
          }}
        />
        {/* Large Watermark White Logo on Left Side filling empty area */}
        <div className="pointer-events-none absolute left-2 sm:left-8 top-1/2 -translate-y-1/2 flex items-center select-none overflow-hidden h-full">
          <img
            src="/whiteLogo.png"
            alt=""
            aria-hidden
            className="h-[150%] sm:h-[180%] max-h-[160px] sm:max-h-[220px] w-auto object-contain opacity-15 sm:opacity-20"
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/55 via-[#0b3fa0]/15 to-transparent"
        />
        <div className="relative z-10 flex flex-col justify-center p-5 sm:p-8 md:p-10 min-h-[135px] sm:min-h-[175px]">
          <nav
            aria-label="breadcrumb"
            className="mb-2 flex items-center gap-2 text-xs font-bold text-white/90 sm:text-sm md:text-base"
          >
            <Link to="/" className="transition hover:text-white hover:underline">
              {lang === "ar" ? "الرئيسية" : "Home"}
            </Link>
            <span aria-hidden className="opacity-70">/</span>
            <span className="max-w-60 truncate font-extrabold text-white">{title}</span>
          </nav>
          <h1 className="text-2xl font-black text-white drop-shadow-md sm:text-4xl lg:text-[42px] leading-tight tracking-wide">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-xs font-semibold text-white/90 drop-shadow sm:text-sm md:text-base">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
