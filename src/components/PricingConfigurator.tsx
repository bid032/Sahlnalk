import { useApp } from "@/contexts/AppContext";
import { Check, ShieldCheck, Sparkles, User, Users } from "lucide-react";

export type PlanItem = {
  id: string;
  label_ar?: string | null;
  label_en?: string | null;
  durAr?: string;
  durEn?: string;
  price: number | string;
  compare_price?: number | string | null;
  stock?: number | null;
  is_active?: boolean;
  plan_variant?: string | null;
  account_type?: string | null;
};

export type PricingConfiguratorProps = {
  accountTypes: ("private" | "shared" | "own")[];
  effectiveAcct: "private" | "shared" | "own";
  onAcctChange: (a: "private" | "shared" | "own") => void;
  plans: PlanItem[];
  selectedId?: string | null;
  onSelectPlan: (id: string) => void;
  discount: number;
  minRawPrice: number;
  variants: string[];
  effectiveVariant: string | null;
  onVariantChange: (v: string) => void;
};

export function PricingConfigurator({
  accountTypes,
  effectiveAcct,
  onAcctChange,
  plans,
  selectedId,
  onSelectPlan,
  discount,
  variants,
  effectiveVariant,
  onVariantChange,
}: PricingConfiguratorProps) {
  const { lang, t } = useApp();
  const isAr = lang === "ar";

  const getAcctLabel = (type: "private" | "shared" | "own") => {
    if (type === "private") return t.badges.private;
    if (type === "own") return (t.badges as any).own || (isAr ? "على حسابك" : "On your account");
    return t.badges.shared;
  };

  const getAcctIcon = (type: "private" | "shared" | "own") => {
    if (type === "private") return <User className="size-4 shrink-0" />;
    if (type === "own") return <ShieldCheck className="size-4 shrink-0" />;
    return <Users className="size-4 shrink-0" />;
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:rounded-3xl sm:p-6">
      {/* ── Account type selector ── */}
      {accountTypes.length > 1 && (
        <div>
          <label className="mb-2 block text-xs font-bold text-muted-foreground sm:text-sm">
            {isAr ? "1. اختار نوع الحساب:" : "1. Select account type:"}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {accountTypes.map((type) => {
              const active = effectiveAcct === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAcctChange(type)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition active:scale-95 sm:text-sm ${
                    active
                      ? "border-brand bg-brand/10 text-brand-deep shadow-sm"
                      : "border-border/60 bg-background/50 text-foreground hover:border-brand/40"
                  }`}
                >
                  {getAcctIcon(type)}
                  <span>{getAcctLabel(type)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Plan variant selector (if any) ── */}
      {variants.length > 1 && (
        <div>
          <label className="mb-2 block text-xs font-bold text-muted-foreground sm:text-sm">
            {isAr ? "2. اختار نوع الخطة:" : "2. Select plan edition:"}
          </label>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = effectiveVariant === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVariantChange(v)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-95 sm:text-sm ${
                    active
                      ? "border-brand bg-brand/10 text-brand-deep shadow-sm"
                      : "border-border/60 bg-background/50 text-foreground hover:border-brand/40"
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Duration / Plans list ── */}
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground sm:text-sm">
          {accountTypes.length > 1 || variants.length > 1
            ? isAr
              ? "اختر مدة الاشتراك:"
              : "Select duration:"
            : isAr
              ? "اختر خطة الاشتراك:"
              : "Select plan:"}
        </label>
        {plans.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            {isAr ? "لا توجد خطط متاحة بهذا الاختيار" : "No plans available for this selection"}
          </div>
        ) : (
          <div className="space-y-2.5">
            {plans.map((pl) => {
              const isSelected = selectedId === pl.id;
              const rawPrice = Number(pl.price ?? 0);
              const compPrice = Number(pl.compare_price ?? 0);
              const finalPrice =
                discount > 0 ? Math.round(rawPrice * (100 - discount)) / 100 : rawPrice;
              const hasComp = compPrice > 0 && compPrice > rawPrice;
              const stock = Number(pl.stock ?? 0);
              const isOut = stock <= 0;
              const label =
                (isAr ? pl.durAr || pl.label_ar : pl.durEn || pl.label_en) ||
                pl.label_ar ||
                pl.label_en ||
                "";

              return (
                <button
                  key={pl.id}
                  type="button"
                  disabled={isOut}
                  onClick={() => onSelectPlan(pl.id)}
                  className={`group relative flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-start transition active:scale-[0.98] sm:p-4 ${
                    isSelected
                      ? "border-brand bg-brand/5 shadow-md ring-1 ring-brand"
                      : isOut
                        ? "cursor-not-allowed border-border/30 bg-muted/20 opacity-50"
                        : "border-border/60 bg-background hover:border-brand/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full border transition ${
                        isSelected
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border text-transparent group-hover:border-brand/40"
                      }`}
                    >
                      <Check className="size-3.5 stroke-[3]" />
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-foreground sm:text-base">
                        {label}
                      </span>
                      {pl.plan_variant && variants.length <= 1 && (
                        <span className="block text-[11px] font-bold text-brand">
                          {pl.plan_variant}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-end shrink-0">
                    <div className="flex items-baseline justify-end gap-1.5">
                      {(discount > 0 || hasComp) && (
                        <span className="text-xs text-muted-foreground line-through tabular-nums">
                          {hasComp ? compPrice : rawPrice} {isAr ? "ج.م" : "EGP"}
                        </span>
                      )}
                      <span className="font-mono text-base font-black text-brand-deep tabular-nums sm:text-lg">
                        {finalPrice} {isAr ? "ج.م" : "EGP"}
                      </span>
                    </div>
                    {isOut ? (
                      <span className="text-[10px] font-bold text-destructive">
                        {t.product.soldOut}
                      </span>
                    ) : stock > 0 && stock <= 5 ? (
                      <span className="text-[10px] font-bold text-warning">
                        {t.product.stockLeft(stock)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-accent/30 px-3 py-2 text-[11px] font-bold text-accent-foreground">
        <Sparkles className="size-4 shrink-0 text-brand" />
        <span>
          {isAr
            ? "جميع الاشتراكات رسمية ومغطاة بضمان الاستبدال الفوري"
            : "All plans are genuine and covered by instant replacement warranty"}
        </span>
      </div>
    </div>
  );
}