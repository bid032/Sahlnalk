import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, ShoppingCart, Zap } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { QuickBuyDialog } from "@/components/QuickBuyDialog";
import { SiteButton } from "@/components/ui/site-button";

export type ProductCardData = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  // Descriptions are intentionally NOT fetched for card listings (home page).
  short_description_ar?: string | null;
  short_description_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  icon_url: string | null;
  cover_url: string | null;
  delivery_type: string;
  account_type: string;
  discount_percent: number;
  minPrice: number | null;
  cheapestPlanId: string | null;
  planLabel_ar: string | null;
  planLabel_en: string | null;
  totalStock: number;
  cheapestPlanComparePrice?: number | null;
};

function flyToCart(fromEl: HTMLElement, iconUrl: string | null, name: string) {
  const target = document.querySelector<HTMLElement>("[data-cart-anchor]");
  if (!target) return;
  const from = fromEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement("div");
  const size = 56;
  ghost.style.cssText = `
    position:fixed;left:${from.left + from.width / 2 - size / 2}px;top:${from.top + from.height / 2 - size / 2}px;
    width:${size}px;height:${size}px;border-radius:16px;pointer-events:none;z-index:9999;
    background:var(--card);border:1px solid color-mix(in oklab, var(--brand) 60%, transparent);
    box-shadow:0 12px 40px -8px color-mix(in oklab, var(--brand) 60%, transparent);
    display:grid;place-items:center;overflow:hidden;color:var(--brand);
    transition:transform 0.75s cubic-bezier(.55,-0.2,.4,1.4),opacity 0.75s ease,border-radius 0.75s ease;
  `;
  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = name;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;";
    ghost.appendChild(img);
  } else {
    ghost.textContent = name.slice(0, 2).toUpperCase();
    ghost.style.fontWeight = "900";
  }
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.15) rotate(360deg)`;
    ghost.style.opacity = "0";
    ghost.style.borderRadius = "50%";
  });
  setTimeout(() => ghost.remove(), 800);
}

export function ProductCard({ p, priority = false }: { p: ProductCardData; priority?: boolean }) {
  const { lang, t, addToCart, notify } = useApp() as any;
  const [buyOpen, setBuyOpen] = useState(false);
  const name = lang === "ar" ? p.name_ar : p.name_en;
  const planLabel = lang === "ar" ? p.planLabel_ar : p.planLabel_en;
  const discount = Number(p.discount_percent ?? 0);
  const hasDiscount = discount > 0 && p.minPrice !== null;
  const finalPrice =
    hasDiscount && p.minPrice !== null
      ? Math.round(p.minPrice * (100 - discount)) / 100
      : p.minPrice;
  // Note: ProductCard doesn't currently support compare_price, but we can add it if needed
  const soldOut = p.totalStock != null && p.totalStock <= 0;

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) {
      notify?.(t.product.soldOut, "error");
      return;
    }
    if (!p.cheapestPlanId || finalPrice === null) {
      notify?.(lang === "ar" ? "لا توجد خطة متاحة" : "No plan available", "error");
      return;
    }
    addToCart({
      productId: p.id,
      planId: p.cheapestPlanId,
      productName: name,
      planLabel: planLabel ?? "",
      price: finalPrice,
      quantity: 1,
      iconUrl: p.icon_url ?? p.icon_url ?? null,
      deliveryType: p.delivery_type,
      accountType: p.account_type,
    });
    flyToCart(e.currentTarget, p.icon_url ?? p.icon_url ?? null, name);
  };

  const openBuy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) {
      notify?.(t.product.soldOut, "error");
      return;
    }
    setBuyOpen(true);
  };

  const isInstant = p.delivery_type === "instant";
  const compareAt =
    p.cheapestPlanComparePrice && p.cheapestPlanComparePrice > (finalPrice ?? 0)
      ? p.cheapestPlanComparePrice
      : null;
  // Old price the customer compares against: explicit compare-price first,
  // otherwise the pre-discount min price when a % discount exists.
  const oldPrice =
    compareAt ??
    (hasDiscount && p.minPrice != null && p.minPrice > (finalPrice ?? 0) ? p.minPrice : null);
  const saveAmount =
    finalPrice !== null && oldPrice !== null
      ? Math.max(0, Math.round((oldPrice - finalPrice) * 100) / 100)
      : 0;

  return (
    <>
      <Link
        to="/product/$slug"
        params={{ slug: p.slug }}
        className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm outline-none transition-all duration-200 hover:-translate-y-1 hover:border-brand/50 hover:shadow-[0_20px_40px_-24px_rgba(11,63,160,0.45)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* ── Cover: same signature as the product-details hero ── */}
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0]">
          {p.cover_url ? (
            <img
              src={p.cover_url}
              alt={name}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 28%), radial-gradient(circle at 60% 15%, rgba(255,255,255,.2) 0, transparent 25%)",
                }}
              />
              {p.icon_url ? (
                <div className="pointer-events-none absolute -bottom-3.5 sm:-bottom-5 inset-x-0 mx-auto w-[94%] sm:w-[98%] max-w-[250px] sm:max-w-[310px] aspect-square rotate-[-6deg] select-none transition-transform duration-300 group-hover:rotate-[-2deg] group-hover:scale-105">
                  <img
                    src={p.icon_url}
                    alt=""
                    aria-hidden
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    className="size-full rounded-2xl sm:rounded-3xl object-cover opacity-100 shadow-2xl ring-4 ring-white/80"
                  />
                </div>
              ) : (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-3.5 sm:-bottom-5 inset-x-0 mx-auto grid w-[94%] sm:w-[98%] max-w-[250px] sm:max-w-[310px] aspect-square rotate-[-6deg] place-items-center rounded-2xl sm:rounded-3xl bg-white/25 text-4xl sm:text-6xl font-black text-white select-none shadow-2xl ring-4 ring-white/80"
                >
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
          />
          {hasDiscount && !soldOut && (
            <span className="absolute top-2.5 start-2.5 rounded-lg bg-destructive px-2 py-0.5 text-[10px] font-black text-destructive-foreground shadow-lg">
              -{discount}%
            </span>
          )}
          {soldOut && (
            <>
              <div className="absolute inset-0 bg-white/55" />
              <span className="absolute top-2.5 start-2.5 rounded-full bg-destructive px-2.5 py-0.5 text-[10px] font-black text-destructive-foreground shadow-lg">
                {t.product.soldOut}
              </span>
            </>
          )}
        </div>

        {/* ── Identity (no text on cover, title & badge below) ── */}
        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
          <h3 className="flex min-w-0 items-center justify-between gap-1.5 text-sm font-black tracking-tight text-foreground sm:text-[15px]">
            <span className="truncate">{name}</span>
            <BadgeCheck className="size-4 shrink-0 text-brand" aria-hidden />
          </h3>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-brand" />
            <span className="truncate">{planLabel || t.product.priceStarting}</span>
            <span aria-hidden className="shrink-0 text-border/80">
              •
            </span>
            <span className="shrink-0">
              {isInstant
                ? lang === "ar"
                  ? "تسليم فوري"
                  : "Instant"
                : lang === "ar"
                  ? "يدوي"
                  : "Manual"}
            </span>
          </p>

          {/* ── Price panel: everything about price in one place ── */}
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground leading-none mb-0.5">
                {soldOut ? (lang === "ar" ? "الحالة" : "Status") : t.product.priceStarting}
              </p>
              <div className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                {soldOut ? (
                  <span className="text-xs font-black text-destructive sm:text-sm">
                    {t.product.soldOut}
                  </span>
                ) : finalPrice !== null ? (
                  <>
                    <span className="text-base font-black text-brand-deep tabular-nums sm:text-lg">
                      {finalPrice}{" "}
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {t.common.currency}
                      </span>
                    </span>
                    {oldPrice !== null && (
                      <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                        {oldPrice}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-base font-black text-brand-deep tabular-nums sm:text-lg">
                    -
                  </span>
                )}
              </div>
            </div>
            {!soldOut &&
              (hasDiscount ? (
                <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-black text-success tabular-nums">
                  -{discount}%
                </span>
              ) : (
                oldPrice !== null &&
                finalPrice !== null && (
                  <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-black text-success tabular-nums">
                    {lang === "ar" ? "وفّر" : "Save"} {saveAmount}
                  </span>
                )
              ))}
          </div>

          {/* ── Actions ── */}
          <div className="mt-2.5 flex items-center gap-1.5">
            <SiteButton
              variant="primary"
              size="pill"
              className="flex-1 py-2 text-[11px] font-extrabold sm:py-2.5 sm:text-[13px]"
              disabled={soldOut}
              onClick={openBuy}
              title={soldOut ? t.product.soldOut : t.product.buyNow}
              aria-label={soldOut ? t.product.soldOut : t.product.buyNow}
            >
              <Zap className="size-3.5" />
              <span>{soldOut ? t.product.soldOut : t.product.buyNow}</span>
            </SiteButton>
            <SiteButton
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full size-9 sm:size-10"
              disabled={soldOut}
              onClick={handleAdd}
              aria-label={soldOut ? t.product.soldOut : t.product.addToCart}
              title={soldOut ? t.product.soldOut : t.product.addToCart}
            >
              <ShoppingCart className="size-4" />
            </SiteButton>
          </div>
        </div>
      </Link>

      <QuickBuyDialog open={buyOpen} onOpenChange={setBuyOpen} product={p} />
    </>
  );
}
