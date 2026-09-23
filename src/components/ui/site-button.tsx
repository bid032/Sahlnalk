import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Site-wide button system (Sahlnalk profile language).
 *
 * - Pill radii everywhere (rounded-full), circles for icon-only buttons.
 * - `primary`   : brand gradient with glow, main conversion action.
 * - `gradient`  : same signature gradient, reserved for auth / hero moments.
 * - `outline`   : secondary action on cards and dialogs.
 * - `filter`    : category/feed pills, combines with `filterActive`.
 * - `dashed`    : coupon-style dashed attention action.
 * - `ghost`     : quiet tertiary action.
 * - `danger`    : destructive confirm.
 *
 * Usage:
 *   <SiteButton variant="primary">اشترِ الآن</SiteButton>
 *   <SiteButton variant="outline" size="icon" aria-label="..."><Share2 /></SiteButton>
 *   <SiteButton href="/shop" variant="filter" filterActive={active}>الكل</SiteButton>
 */

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const siteButtonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 ${FOCUS_RING}`,
  {
    variants: {
      variant: {
        primary:
          "btn-shine rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_12px_28px_-10px_rgba(11,95,192,0.7),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(11,63,160,0.35)] hover:brightness-110 hover:shadow-[0_16px_34px_-10px_rgba(11,95,192,0.8),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(11,63,160,0.35)]",
        gradient:
          "btn-shine rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_12px_28px_-10px_rgba(11,95,192,0.7),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(11,63,160,0.35)] hover:brightness-110 hover:shadow-[0_16px_34px_-10px_rgba(11,95,192,0.8),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(11,63,160,0.35)]",
        outline:
          "rounded-full border border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-brand/60 hover:bg-brand/5 hover:text-brand hover:shadow-[0_10px_24px_-12px_var(--brand)]",
        ghost: "rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
        success:
          "btn-shine rounded-full bg-gradient-to-l from-[#15803d] via-[#16a34a] to-[#4ade80] text-white ring-1 ring-inset ring-white/25 shadow-[0_10px_24px_-10px_rgba(22,163,74,0.6),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 dark:text-white",
        dashed:
          "rounded-full border-2 border-dashed border-brand/40 bg-brand/5 text-brand hover:bg-brand/10 hover:border-brand hover:shadow-[0_10px_24px_-12px_var(--brand)]",
        danger:
          "rounded-full bg-destructive text-destructive-foreground ring-1 ring-inset ring-white/20 shadow-sm hover:brightness-105 hover:shadow-[0_10px_24px_-12px_var(--destructive)]",
        filter: "rounded-full border",
      },
      size: {
        default: "px-5 py-2.5 text-sm [&_svg]:size-4",
        sm: "px-4 py-2 text-xs [&_svg]:size-3.5",
        pill: "px-5 py-2.5 text-sm [&_svg]:size-4",
        lg: "px-6 py-3 text-sm sm:text-base [&_svg]:size-4",
        filter: "px-4 py-1.5 text-xs sm:text-[13px]",
        iconSm: "size-8 [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        iconLg: "size-11 [&_svg]:size-5",
      },
      filterActive: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "filter",
        filterActive: true,
        className:
          "border-transparent bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_10px_24px_-10px_rgba(11,95,192,0.65)]",
      },
      {
        variant: "filter",
        filterActive: false,
        className:
          "border-border bg-card text-muted-foreground hover:border-brand/50 hover:text-brand",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "pill",
      filterActive: false,
    },
  },
);

export interface SiteButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof siteButtonVariants> {
  asChild?: boolean;
}

const SiteButton = React.forwardRef<HTMLButtonElement, SiteButtonProps>(
  ({ className, variant, size, filterActive, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(siteButtonVariants({ variant, size, filterActive, className }))}
        ref={ref}
        type={asChild ? undefined : type}
        {...props}
      />
    );
  },
);
SiteButton.displayName = "SiteButton";

export { SiteButton, siteButtonVariants };
