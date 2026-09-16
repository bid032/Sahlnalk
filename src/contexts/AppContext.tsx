import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { translations, type Lang, type Dict } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackAddToCart } from "@/lib/meta-pixel";

// ---- Cart ----
export type CartItem = {
  productId: string;
  planId: string;
  productName: string;
  planLabel: string;
  price: number;
  quantity: number;
  iconUrl?: string | null;
  deliveryType: "instant" | "manual";
  accountType: "private" | "shared" | "both" | "own";
};

type Theme = "dark" | "light";
type ThemeMode = "light" | "dark" | "both";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type ToastMsg = { id: number; type: "success" | "error" | "info"; message: string };

type AppState = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
  theme: Theme;
  toggleTheme: () => void;
  themeMode: ThemeMode;
  cart: CartItem[];
  addToCart: (item: CartItem) => void | Promise<void>;
  removeFromCart: (productId: string, planId: string) => void;
  updateQty: (productId: string, planId: string, qty: number) => void | Promise<void>;
  updatePrice: (productId: string, planId: string, price: number) => void;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  cartTotal: number;
  cartCount: number;
  cartBumpKey: number;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, type?: ToastMsg["type"]) => void;
};

const AppContext = createContext<AppState | null>(null);

const isBrowser = typeof window !== "undefined";

/** Keys shared with the pre-paint script in `src/routes/__root.tsx`. */
export const THEME_KEY = "rk-theme";
export const THEME_MODE_KEY = "rk-theme-mode";

function getInitialTheme(): Theme {
  // Original design: dark by default (matches production build).
  return "dark";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartBumpKey, setCartBumpKey] = useState(0);

  // Theme mode comes from Dashboard Settings (theme_mode: light|dark|both).
  // "both" = visitor can toggle, otherwise the site is locked to that theme.
  const themeModeQuery = useQuery({
    queryKey: ["site-settings", "theme_mode"],
    queryFn: async (): Promise<ThemeMode> => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "theme_mode")
        .maybeSingle();
      const v = (data?.value as any)?.mode;
      return v === "light" || v === "dark" || v === "both" ? v : "both";
    },
    staleTime: 60_000,
  });

  const themeMode: ThemeMode = themeModeQuery.data ?? "both";

  // Enforce an admin-locked theme as soon as settings + hydration are ready.
  useEffect(() => {
    if (!hydrated || !themeModeQuery.data) return;
    if (themeMode === "light" || themeMode === "dark") {
      setTheme(themeMode);
    }
  }, [themeMode, hydrated, themeModeQuery.data]);

  useEffect(() => {
    if (!isBrowser || !themeModeQuery.data) return;
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch {}
  }, [themeMode, themeModeQuery.data]);

  // ---- Confirm modal ----
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  // ---- Toasts ----
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);
  const notify = useCallback((message: string, type: ToastMsg["type"] = "info") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const syncCartWithDB = useCallback(
    async (currentCart: CartItem[]) => {
      if (!currentCart || currentCart.length === 0) return;
      try {
        const planIds = Array.from(new Set(currentCart.map((c) => c.planId)));
        const { data: plansData, error } = await supabase
          .from("product_plans")
          .select(
            `
            id,
            price,
            stock,
            is_active,
            label_ar,
            label_en,
            products (
              id,
              status,
              name_ar,
              name_en,
              icon_url,
              delivery_type,
              account_type,
              discount_percent
            )
          `,
          )
          .in("id", planIds);

        if (error || !plansData) return;

        const planMap = new Map<string, any>(plansData.map((p: any) => [p.id, p]));
        let hasChanges = false;
        const updatedCart: CartItem[] = [];
        const notifications: { msg: string; type: ToastMsg["type"] }[] = [];

        for (const item of currentCart) {
          const livePlan = planMap.get(item.planId);
          const liveProduct = livePlan?.products;

          if (!livePlan || !livePlan.is_active || !liveProduct || liveProduct.status !== "active") {
            hasChanges = true;
            notifications.push({
              msg:
                lang === "ar"
                  ? `عفواً، المنتج (${item.productName}) لم يعد متوفراً وتم إزالته من السلة`
                  : `Sorry, (${item.productName}) is no longer available and was removed from cart`,
              type: "error",
            });
            continue;
          }

          const rawPrice = Number(livePlan.price ?? 0);
          const discountPercent = Number(liveProduct.discount_percent ?? 0);
          const livePrice =
            discountPercent > 0 ? Math.round(rawPrice * (100 - discountPercent)) / 100 : rawPrice;
          const liveStock = Math.max(0, Number(livePlan.stock ?? 0));
          let itemQty = item.quantity;
          let itemPrice = item.price;

          if (liveStock <= 0) {
            hasChanges = true;
            notifications.push({
              msg:
                lang === "ar"
                  ? `خلص مخزون المنتج (${item.productName}) وتم إزالته من السلة`
                  : `(${item.productName}) is out of stock and was removed from cart`,
              type: "error",
            });
            continue;
          } else if (itemQty > liveStock) {
            hasChanges = true;
            itemQty = liveStock;
            notifications.push({
              msg:
                lang === "ar"
                  ? `تم تعديل كمية (${item.productName}) إلى ${liveStock} لعدم توفر كمية إضافية`
                  : `Updated (${item.productName}) quantity to ${liveStock} based on available stock`,
              type: "info",
            });
          }

          if (livePrice !== itemPrice) {
            hasChanges = true;
            notifications.push({
              msg:
                lang === "ar"
                  ? `تم تحديث سعر (${item.productName}) من ${itemPrice} إلى ${livePrice} ج.م`
                  : `Updated (${item.productName}) price to ${livePrice} EGP`,
              type: "info",
            });
            itemPrice = livePrice;
          }

          const prodName =
            (lang === "ar" ? liveProduct.name_ar : liveProduct.name_en) ||
            liveProduct.name_ar ||
            item.productName;
          const planLbl =
            (lang === "ar" ? livePlan.label_ar : livePlan.label_en) ||
            livePlan.label_ar ||
            item.planLabel;

          updatedCart.push({
            ...item,
            productName: prodName,
            planLabel: planLbl,
            price: itemPrice,
            quantity: itemQty,
            iconUrl: liveProduct.icon_url ?? item.iconUrl,
            deliveryType: liveProduct.delivery_type ?? item.deliveryType,
            accountType: liveProduct.account_type ?? item.accountType,
          });
        }

        if (hasChanges) {
          setCart(updatedCart);
          notifications.forEach((n) => notify(n.msg, n.type));
        }
      } catch (e) {
        console.error("Failed to sync cart with DB:", e);
      }
    },
    [lang, notify],
  );

  const syncCart = useCallback(async () => {
    await syncCartWithDB(cart);
  }, [cart, syncCartWithDB]);

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    if (!isBrowser) return;
    const storedLang = localStorage.getItem("rk-lang") as Lang | null;
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    const storedTheme = localStorage.getItem(THEME_KEY);
    const storedCart = localStorage.getItem("rk-cart");
    if (storedLang === "ar" || storedLang === "en") setLangState(storedLang);
    if (storedMode === "light" || storedMode === "dark") {
      setTheme(storedMode);
    } else if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
    if (storedCart) {
      try {
        const parsed = JSON.parse(storedCart);
        setCart(parsed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          syncCartWithDB(parsed);
        }
      } catch {}
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    const html = document.documentElement;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    html.lang = lang;
    if (hydrated) localStorage.setItem("rk-lang", lang);
  }, [lang, hydrated]);

  useEffect(() => {
    if (!isBrowser || !hydrated) return;
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme, themeMode, hydrated]);

  useEffect(() => {
    if (!isBrowser || !hydrated) return;
    localStorage.setItem("rk-cart", JSON.stringify(cart));
  }, [cart, hydrated]);

  // Cross-tab sync: adding in one tab updates every other open tab instantly.
  // (storage events only fire in *other* tabs, so no update loops.)
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "rk-cart") {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          if (Array.isArray(parsed)) setCart(parsed);
        } catch {}
      }
      if (e.key === "rk-lang" && (e.newValue === "ar" || e.newValue === "en")) {
        setLangState(e.newValue as Lang);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLang = (l: Lang) => setLangState(l);
  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const playAddSound = () => {
    if (!isBrowser) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.22);
    } catch {}
  };

  const fetchPlanStock = async (planId: string): Promise<number | null> => {
    try {
      const { data } = await supabase
        .from("product_plans")
        .select("stock")
        .eq("id", planId)
        .maybeSingle();
      if (data == null) return null;
      const n = Number((data as any).stock ?? 0);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    } catch {
      return null;
    }
  };

  const addToCart = async (item: CartItem) => {
    const stock = await fetchPlanStock(item.planId);
    let notice: { msg: string; type: ToastMsg["type"] } | null = null as {
      msg: string;
      type: ToastMsg["type"];
    } | null;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === item.productId && c.planId === item.planId);
      const currentQty = idx >= 0 ? prev[idx].quantity : 0;
      let requested = currentQty + item.quantity;
      if (stock != null) {
        if (stock <= 0) {
          notice = {
            msg: lang === "ar" ? "خلص المخزون" : "Out of stock",
            type: "error",
          };
          return prev;
        }
        if (requested > stock) {
          requested = stock;
          notice = {
            msg: lang === "ar" ? `الحد الأقصى المتاح ${stock}` : `Only ${stock} available in stock`,
            type: "info",
          };
        }
      }
      const finalQty = Math.max(1, requested);
      if (idx >= 0) {
        if (finalQty === currentQty) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: finalQty };
        return copy;
      }
      return [...prev, { ...item, quantity: finalQty }];
    });
    if (notice) notify(notice.msg, notice.type);
    playAddSound();
    setCartBumpKey((k) => k + 1);

    // Meta Pixel Event
    trackAddToCart({
      id: item.productId,
      name: `${item.productName} (${item.planLabel})`,
      price: item.price,
      quantity: item.quantity,
    });
  };
  const removeFromCart = (productId: string, planId: string) =>
    setCart((prev) => prev.filter((c) => !(c.productId === productId && c.planId === planId)));
  const updateQty = async (productId: string, planId: string, qty: number) => {
    const stock = await fetchPlanStock(planId);
    let capped = Math.max(1, qty);
    let notice: string | null = null;
    if (stock != null) {
      if (stock <= 0) {
        setCart((prev) => prev.filter((c) => !(c.productId === productId && c.planId === planId)));
        notify(lang === "ar" ? "خلص المخزون" : "Out of stock", "error");
        return;
      }
      if (capped > stock) {
        capped = stock;
        notice = lang === "ar" ? `الحد الأقصى المتاح ${stock}` : `Only ${stock} available in stock`;
      }
    }
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.planId === planId ? { ...c, quantity: capped } : c,
      ),
    );
    if (notice) notify(notice, "info");
  };
  const updatePrice = (productId: string, planId: string, price: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.planId === planId ? { ...c, price: Math.max(0, price) } : c,
      ),
    );
  };
  const clearCart = () => {
    setCart([]);
    if (isBrowser && hydrated) {
      localStorage.setItem("rk-cart", JSON.stringify([]));
    }
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const value: AppState = {
    lang,
    setLang,
    t: translations[lang] as Dict,
    theme,
    toggleTheme,
    themeMode,
    cart,
    addToCart,
    removeFromCart,
    updateQty,
    updatePrice,
    clearCart,
    syncCart,
    cartTotal,
    cartCount,
    cartBumpKey,
    confirm,
    notify,
  };

  const isAr = lang === "ar";

  return (
    <AppContext.Provider value={value}>
      {children}

      {/* Custom branded confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[10000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div
                className={`size-12 rounded-xl grid place-items-center shrink-0 ${
                  confirmState.tone === "danger"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-brand/10 text-brand"
                }`}
              >
                <span className="text-2xl">{confirmState.tone === "danger" ? "" : ""}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-extrabold mb-1">
                  {confirmState.title ?? (isAr ? "تأكيد" : "Confirm")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {confirmState.message}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="px-4 py-2 border border-border rounded-lg font-bold hover:bg-muted transition"
              >
                {confirmState.cancelLabel ?? (isAr ? "إلغاء" : "Cancel")}
              </button>
              <button
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`px-5 py-2 rounded-lg font-bold transition ${
                  confirmState.tone === "danger"
                    ? "bg-destructive text-destructive-foreground hover:opacity-90"
                    : "bg-brand text-brand-foreground hover:brand-glow"
                }`}
              >
                {confirmState.confirmLabel ?? (isAr ? "تأكيد" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All toasts: center-top fixed inside viewport */}
      {toasts.length > 0 && (
        <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[10010] flex flex-col items-center w-full pointer-events-none">
          <div className="w-[min(92vw,420px)] flex flex-col gap-2">
            {toasts.map((tt) => (
              <div
                key={tt.id}
                className={`px-4 py-3 rounded-xl border shadow-2xl text-center text-sm font-bold pointer-events-auto backdrop-blur animate-in fade-in slide-in-from-top-4 ${
                  tt.type === "success"
                    ? "bg-success/15 border-success/30 text-success"
                    : tt.type === "error"
                      ? "bg-destructive/15 border-destructive/30 text-destructive"
                      : "bg-card border-border text-foreground"
                }`}
              >
                {tt.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
