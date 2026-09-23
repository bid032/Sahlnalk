import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Briefcase,
  Clapperboard,
  Code2,
  Gamepad2,
  GraduationCap,
  Laptop,
  LayoutGrid,
  Megaphone,
  Palette,
  Share2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { PublicCategory } from "@/lib/public-queries";

function isImgUrl(icon: string | null): icon is string {
  return !!icon && /^(https?:\/\/|\/|data:image)/.test(icon);
}

/** Professional lucide icon per category (slug + names, ar/en). */
export function categoryIconFor(c: Pick<PublicCategory, "slug" | "name_ar" | "name_en">): LucideIcon {
  const hay = `${c.slug} ${c.name_ar} ${c.name_en}`.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => hay.includes(k));
  if (has("ai", "ذكاء", "bot", "روبوت", "chat", "gpt", "midjourney")) return Bot;
  if (has("design", "تصميم", "مصمم", "palette", "canva", "adobe", "فوتوشوب", "مونتاج")) return Palette;
  if (has("software", "برامج", "windows", "ويندوز", "office", "أوفيس", "microsoft", "laptop", "حماية", "antivirus")) return Laptop;
  if (has("edu", "تعليم", "كورس", "course", "learn", "مدرسة", "جامعة", "udemy", "coursera")) return GraduationCap;
  if (has("entertainment", "ترفيه", "netflix", "spotify", "music", "موسيقى", "فيديو", "video", "شاهد")) return Clapperboard;
  if (has("game", "ألعاب", "لعب", "play", "xbox", "playstation")) return Gamepad2;
  if (has("vpn", "security", "أمان", "proxy", "بروكسي")) return ShieldCheck;
  if (has("social", "سوشيال", "تواصل", "tiktok", "instagram", "followers", "متابعين")) return Share2;
  if (has("code", "برمجة", "develop", "مطور", "github")) return Code2;
  if (has("market", "تسويق", "ads", "إعلان")) return Megaphone;
  if (has("business", "بيزنس", "شركات", "أعمال")) return Briefcase;
  return LayoutGrid;
}

/** Professional icon tile shared by every category surface (cards + menus). */
export function CategoryIcon({
  category,
  size = "md",
}: {
  category: Pick<PublicCategory, "slug" | "name_ar" | "name_en" | "icon">;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "sm"
      ? "size-8 rounded-lg [&_svg]:size-4"
      : size === "lg"
        ? "size-14 rounded-2xl [&_svg]:size-7"
        : "size-12 rounded-2xl [&_svg]:size-6";
  if (isImgUrl(category.icon)) {
    return (
      <span
        className={`grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm ring-1 ring-border/60 ${box}`}
        aria-hidden
      >
        <img
          src={category.icon}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  const Icon = categoryIconFor(category);
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-[#33d9f7] via-[#00a9e0] to-[#0b5fc0] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_10px_25px_-10px_rgba(11,95,192,0.65),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(11,63,160,0.35)] transition-all duration-200 group-hover:brightness-110 group-hover:shadow-[0_12px_28px_-8px_rgba(11,95,192,0.75)] ${box}`}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

type CategoryCardProps = {
  c: PublicCategory;
  count?: number;
};

/**
 * Horizontal premium category card — deliberately different from the
 * vertical ProductCard: pro lucide icon, description, stat + arrow.
 */
export function CategoryCard({ c, count }: CategoryCardProps) {
  const { lang } = useApp();
  const isAr = lang === "ar";
  const GoIcon = isAr ? ArrowLeft : ArrowRight;
  const name = isAr ? c.name_ar : c.name_en;
  const desc = (isAr ? c.description_ar : c.description_en)?.trim();

  return (
    <Link
      to="/shop"
      search={{ category: c.slug } as any}
      className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_18px_36px_-20px_rgba(11,63,160,0.5)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] sm:p-5"
    >
      {/* soft brand wash on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-l from-brand/[0.07] via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      {/* giant ghost icon */}
      <GhostIcon category={c} />

      <CategoryIcon category={c} size="lg" />

      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-extrabold sm:text-lg">{name}</span>
          {typeof count === "number" && (
            <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-black text-brand tabular-nums">
              {count}
            </span>
          )}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          {desc || (isAr ? "اضغط لعرض خدمات القسم" : "Tap to view this section")}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold text-brand">
          {isAr ? "تصفح القسم" : "Browse section"}
          <GoIcon className="size-3.5 transition-transform duration-200 group-hover:-translate-x-1 rtl:group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  );
}

function GhostIcon({ category }: { category: PublicCategory }) {
  if (isImgUrl(category.icon)) return null;
  const Icon = categoryIconFor(category);
  return (
    <Icon
      aria-hidden
      className="pointer-events-none absolute -bottom-6 -end-4 size-28 rotate-[-10deg] text-brand/[0.07] transition-all duration-300 group-hover:scale-110 group-hover:text-brand/[0.12]"
    />
  );
}

/**
 * Compact category chip for the horizontal strip on top of the products
 * feed: icon tile + name + count + arrow.
 */
export function CategoryChip({ c, count }: CategoryCardProps) {
  const { lang } = useApp();
  const isAr = lang === "ar";
  const GoIcon = isAr ? ArrowLeft : ArrowRight;
  const name = isAr ? c.name_ar : c.name_en;

  return (
    <Link
      to="/shop"
      search={{ category: c.slug } as any}
      className="group flex w-[220px] shrink-0 snap-start items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_14px_28px_-18px_rgba(11,63,160,0.5)] focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] sm:w-full sm:shrink sm:p-3.5"
    >
      <CategoryIcon category={c} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold">{name}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
          {typeof count === "number" ? (
            <>
              <b className="text-brand">{count}</b> {isAr ? "خدمة" : "items"}
            </>
          ) : isAr ? (
            "تصفح القسم"
          ) : (
            "Browse"
          )}
        </span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand transition-all duration-200 group-hover:bg-brand group-hover:text-brand-foreground group-hover:shadow-[0_8px_20px_-8px_var(--brand)]">
        <GoIcon className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
