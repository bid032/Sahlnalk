import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/contexts/AppContext";
import { SiteButton } from "@/components/ui/site-button";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";

export function CartDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { lang, t, cart, removeFromCart, updateQty, cartTotal } = useApp();
  const isRtl = lang === "ar";
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="w-[300px] sm:w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ShoppingBag className="size-5 text-brand" />
            {t.cart.title}
            {cart.length > 0 && (
              <span className="ms-auto text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-bold">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="size-20 rounded-full bg-muted grid place-items-center">
                <ShoppingBag className="size-8 text-muted-foreground" />
              </div>
              <div className="font-bold text-foreground">{t.cart.empty}</div>
              <p className="text-sm text-muted-foreground max-w-[220px]">{t.cart.emptyDesc}</p>
              <SiteButton variant="outline" size="sm" asChild className="mt-2">
                <Link to="/shop" onClick={close}>
                  {t.cart.goShopping}
                </Link>
              </SiteButton>
            </div>
          ) : (
            <ul className="space-y-3">
              {cart.map((item) => (
                <li
                  key={`${item.productId}-${item.planId}`}
                  className="flex gap-3 p-3 rounded-xl border border-border bg-card/50 hover:border-brand/30 transition"
                >
                  <div className="size-16 shrink-0 rounded-lg overflow-hidden bg-muted grid place-items-center">
                    {item.iconUrl ? (
                      <img src={item.iconUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-brand font-black text-lg">
                        {item.productName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-foreground truncate">
                      {item.productName}
                    </div>
                    {item.planLabel && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {item.planLabel}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center border border-border rounded-lg">
                        <button
                          type="button"
                          onClick={() =>
                            updateQty(item.productId, item.planId, Math.max(1, item.quantity - 1))
                          }
                          className="size-7 grid place-items-center hover:bg-muted transition"
                          aria-label="-"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.productId, item.planId, item.quantity + 1)}
                          className="size-7 grid place-items-center hover:bg-muted transition"
                          aria-label="+"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <div className="text-sm font-extrabold text-brand">
                        {(item.price * item.quantity).toFixed(2)} {t.common.currency}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId, item.planId)}
                    className="size-7 self-start grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    aria-label={t.cart.remove}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-border p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.cart.total}</span>
              <span className="text-xl font-black text-foreground">
                {cartTotal.toFixed(2)} {t.common.currency}
              </span>
            </div>
            <SiteButton variant="primary" asChild className="w-full py-3">
              <Link to="/checkout" onClick={close}>
                {t.cart.checkout}
              </Link>
            </SiteButton>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
