import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

type Props = {
  to: string;
  search?: Record<string, unknown>;
  label?: string;
  size?: "sm" | "md";
};

/**
 * Unified "View all / More" pill button used across the entire site.
 * Signature brand gradient, arrow that flips with locale.
 */
export function ViewAllButton({ to, search, label, size = "md" }: Props) {
  const { lang } = useApp();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const padding =
    size === "sm"
      ? "px-4 py-2 text-xs"
      : "px-5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm";
  return (
    <Link
      to={to as any}
      search={search as any}
      data-gsap="magnetic"
      data-strength="0.3"
      className={`group inline-flex items-center gap-2 ${padding} rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] font-bold ring-1 ring-inset ring-white/30 shadow-[0_10px_24px_-10px_rgba(11,95,192,0.65)] hover:brand-glow hover:-translate-y-0.5 transition-all shrink-0 active:translate-y-0`}
    >
      <span>{label ?? (lang === "ar" ? "عرض الكل" : "View all")}</span>
      <span className="grid place-items-center size-6 rounded-full bg-white/20 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
        <Arrow className="size-3.5" />
      </span>
    </Link>
  );
}
