import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { notifyNewOrder, notifyCustomerDelivery } from "@/lib/notify-order.functions";

import { friendlyErrorMessage } from "@/lib/error-handler";
import { ARAB_COUNTRIES, dialForCountry } from "@/lib/arab-countries";
import { filterName, filterDigits, filterEmail, filterPhone } from "@/lib/input-filters";
import { trackInitiateCheckout, trackPurchase } from "@/lib/meta-pixel";
import { BadgePercent, ReceiptText, ShieldCheck, ShoppingCart, Store, Wallet } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useSiteSetting } from "@/hooks/useSiteSetting";
import { clearPendingCoupon, getPendingCoupon } from "@/lib/coupon-storage";
import { SiteButton } from "@/components/ui/site-button";
import { trackMetaCapiServerFn } from "@/lib/meta-pixel.functions";
import {
  createPayPalOrderServerFn,
  capturePayPalOrderServerFn,
  getPublicPayPalConfigServerFn,
  cancelPendingOrderServerFn,
} from "@/lib/paypal.functions";

/**
 * Cancel a still-pending order (PayPal onCancel / stale cleanup). The direct
 * client-side UPDATE silently fails for guests (no UPDATE grant on `orders`),
 * so go through the guest-safe server function first.
 */
async function cancelPendingOrderEverywhere(orderId: string | null) {
  if (!orderId) return;
  try {
    await cancelPendingOrderServerFn({ data: { orderId } });
  } catch {
    /* non-blocking hygiene */
  }
}

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "سهلنالك | إتمام الطلب" },
      { name: "description", content: "كمّل بياناتك وادفع بالطريقة اللي تريحك - اشتراكك بيبدأ يتجهز أول ما تأكّد." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CheckoutPage,
});

type Gateway = "paymob" | "kashier" | "wallet_instapay" | "manual" | "simulate" | "paypal";

const WHATSAPP_NUMBER = "01284234815";

function PayPalButtonsComponent({
  clientId,
  onServerCreateOrder,
  onServerCaptureOrder,
  onValidateForm,
  onError,
  lang,
}: {
  clientId: string;
  onServerCreateOrder: () => Promise<string>;
  onServerCaptureOrder: (paypalOrderId: string) => Promise<void>;
  onValidateForm: () => boolean;
  onError: (msg: string) => void;
  lang: "ar" | "en";
}) {
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsInstanceRef = useRef<any>(null);

  const onValidateFormRef = useRef(onValidateForm);
  onValidateFormRef.current = onValidateForm;
  const onServerCreateOrderRef = useRef(onServerCreateOrder);
  onServerCreateOrderRef.current = onServerCreateOrder;
  const onServerCaptureOrderRef = useRef(onServerCaptureOrder);
  onServerCaptureOrderRef.current = onServerCaptureOrder;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!clientId || !clientId.trim()) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    const scriptId = "paypal-sdk-script";

    const cleanupButtons = () => {
      if (buttonsInstanceRef.current) {
        try {
          buttonsInstanceRef.current.close();
        } catch { }
        buttonsInstanceRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };

    const renderButtons = () => {
      if (!containerRef.current || !(window as any).paypal || !isMounted) return;
      cleanupButtons();

      try {
        const buttons = (window as any).paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "pay",
            height: 48,
          },
          onClick: (_data: any, actions: any) => {
            if (!onValidateFormRef.current()) {
              return actions.reject();
            }
          },
          createOrder: async () => {
            try {
              const paypalOrderId = await onServerCreateOrderRef.current();
              return paypalOrderId;
            } catch (err: any) {
              console.error("PayPal server create order error:", err);
              let msg = err.message || "";
              if (msg.includes("PAYPAL_CREDENTIALS_MISSING") || msg.includes("clientSecret")) {
                msg =
                  langRef.current === "ar"
                    ? "لم يتم كِتابة المفتاح السري (Client Secret) لـ PayPal في لوحة تحكم الأدمن بعد."
                    : "PayPal Client Secret is missing in admin dashboard settings.";
              } else if (msg.includes("PAYPAL_AUTH_FAILED")) {
                msg =
                  langRef.current === "ar"
                    ? "فشل التوثيق مع PayPal. يرجى التأكد من صحة Client ID و Client Secret في لوحة التحكم وأن بيئة العمل (Sandbox/Live) صحيحة."
                    : "PayPal authentication failed. Please check Client ID and Secret in settings.";
              } else if (!msg) {
                msg =
                  langRef.current === "ar"
                    ? "فشلت عملية إنشاء طلب PayPal"
                    : "Failed to create PayPal order";
              }
              onErrorRef.current(msg);
              throw err;
            }
          },
          onApprove: async (data: any) => {
            try {
              await onServerCaptureOrderRef.current(data.orderID);
            } catch (err: any) {
              console.error("PayPal server capture order error:", err);
              onErrorRef.current(
                err.message ||
                (langRef.current === "ar"
                  ? "فشلت عملية تأكيد الدفع عبر PayPal"
                  : "PayPal payment capture failed"),
              );
            }
          },
          onCancel: async () => {
            console.log("PayPal checkout cancelled by user");
            try {
              const pendingId =
                typeof window !== "undefined"
                  ? sessionStorage.getItem("rk_pending_paypal_order_id")
                  : null;
              if (pendingId) {
                sessionStorage.removeItem("rk_pending_paypal_order_id");
                await cancelPendingOrderEverywhere(pendingId);
              }
            } catch (e) {
              console.error("Failed to mark cancelled order:", e);
            }
          },
          onError: (err: any) => {
            console.error("PayPal SDK error:", err);
          },
        });

        if (containerRef.current) {
          buttons.render(containerRef.current);
          buttonsInstanceRef.current = buttons;
        }
        if (isMounted) setLoading(false);
      } catch (e) {
        console.error("Failed to render PayPal buttons", e);
      }
    };

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript && existingScript.getAttribute("data-client-id") !== clientId.trim()) {
      cleanupButtons();
      existingScript.remove();
      try {
        delete (window as any).paypal;
      } catch { }
    }

    if (document.getElementById(scriptId) && (window as any).paypal) {
      renderButtons();
    } else if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.setAttribute("data-client-id", clientId.trim());
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId.trim()}&currency=USD&intent=capture&commit=true&enable-funding=card`;
      script.async = true;
      script.onload = () => {
        if (isMounted) renderButtons();
      };
      script.onerror = () => {
        if (isMounted) {
          setLoading(false);
          onErrorRef.current(
            langRef.current === "ar" ? "تعذر تحميل بوابة PayPal" : "Failed to load PayPal SDK",
          );
        }
      };
      document.body.appendChild(script);
    }

    return () => {
      isMounted = false;
      cleanupButtons();
    };
  }, [clientId]);

  if (!clientId || !clientId.trim()) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-2 text-xs sm:text-sm animate-in fade-in">
        <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
          <span>
            {lang === "ar"
              ? "بوابة PayPal مجهزة ومُعدّة بالكامل"
              : "PayPal Gateway Fully Configured"}
          </span>
        </div>
        <p className="leading-relaxed">
          {lang === "ar"
            ? "الكود جاهز تماماً. بمجرد إدخال Client ID الخاص بك من الداشبورد ستظهر أزرار الدفع المباشرة للعملاء فوراً."
            : "The integration is ready. Enter your Client ID in the Admin Dashboard to activate live checkout."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-h-[120px] pt-2">
      {loading && (
        <div className="p-4 text-center text-xs text-muted-foreground animate-pulse font-medium">
          {lang === "ar"
            ? "جاري تحميل أزرار بايبال والبطاقات البنكية..."
            : "Loading secure PayPal & Card buttons..."}
        </div>
      )}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-50 text-slate-900 border-2 border-slate-200 dark:border-cyan-500/40 shadow-xl dark:shadow-[0_0_30px_rgba(34,195,230,0.2)] transition-all duration-300">
        <div ref={containerRef} className="w-full min-h-[100px]" />
      </div>
    </div>
  );
}

function CheckoutPage() {
  const {
    t,
    cart,
    cartTotal,
    cartCount,
    clearCart,
    lang,
    updateQty,
    updatePrice,
    removeFromCart,
    syncCart,
  } = useApp();
  const contact = useSiteSetting<Record<string, string>>("contact");
  const scrollToStep = (id: string) => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string | null) => {
    setError(msg);
    if (msg) {
      toast.error(msg, { duration: 4000 });
    }
  };
  const [stockIssues, setStockIssues] = useState<
    {
      planId: string;
      productName: string;
      planLabel: string;
      requested: number;
      available: number;
    }[]
  >([]);
  const [priceIssues, setPriceIssues] = useState<
    { planId: string; productName: string; planLabel: string; oldPrice: number; newPrice: number }[]
  >([]);

  const [senderPhone, setSenderPhone] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  // New state for wallet and instapay numbers
  const [walletCopied, setWalletCopied] = useState(false);
  const [instapayCopied, setInstapayCopied] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string;
    code: string;
    discount: number;
  } | null>(null);

  const discount = appliedCoupon?.discount ?? 0;
  const finalTotal = Math.max(0, cartTotal - discount);

  // Auto-remove coupon if cart changes (subtotal or products) invalidate min-order or scope
  useEffect(() => {
    if (!appliedCoupon) return;
    // Re-validate on cart change
    (async () => {
      const productIds = Array.from(new Set(cart.map((c) => c.productId)));
      const itemsPayload = cart.map((c) => ({
        productId: c.productId,
        price: c.price,
        quantity: c.quantity,
      }));
      const { data, error } = await supabase.rpc("validate_coupon", {
        _code: appliedCoupon.code,
        _subtotal: cartTotal,
        _product_ids: productIds,
        _items: itemsPayload as any,
      });
      if (error || !data || !data[0]?.valid) {
        setAppliedCoupon(null);
      } else {
        const d = data[0] as any;
        if (Number(d.discount) !== appliedCoupon.discount) {
          setAppliedCoupon({ id: d.coupon_id, code: d.code, discount: Number(d.discount) });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartTotal, cart.length]);

  // Track Meta Pixel InitiateCheckout
  useEffect(() => {
    if (cart.length > 0) {
      trackInitiateCheckout(
        cart.map((c) => ({
          id: c.productId,
          name: c.productName,
          price: c.price,
          quantity: c.quantity,
        })),
        finalTotal,
      );
    }
  }, []);

  // Auto-apply a coupon saved from a product page ("apply instantly").
  // Reactive on cart readiness: the cart hydrates from storage after mount,
  // so a mount-only effect would run while the cart is still empty.
  // NOTE: cleanup MUST reset the flags, otherwise a cart change mid-flight
  // deadlocks the flow (old attempt discarded, new one blocked, "..." stuck).
  const pendingCouponInflight = useRef(false);
  useEffect(() => {
    if (appliedCoupon || cart.length === 0 || pendingCouponInflight.current) return;
    const pending = getPendingCoupon();
    if (!pending) return;
    pendingCouponInflight.current = true;
    setCouponApplying(true);
    let cancelled = false;
    (async () => {
      try {
        const productIds = Array.from(new Set(cart.map((c) => c.productId)));
        const itemsPayload = cart.map((c) => ({
          productId: c.productId,
          price: c.price,
          quantity: c.quantity,
        }));
        const { data, error } = await supabase.rpc("validate_coupon", {
          _code: pending,
          _subtotal: cartTotal,
          _product_ids: productIds,
          _items: itemsPayload as any,
        });
        if (cancelled) return;
        clearPendingCoupon();
        if (error) throw error;
        const row = data?.[0] as any;
        if (!row?.valid) {
          setCouponError(row?.message || (lang === "ar" ? "كود غير صالح" : "Invalid code"));
          return;
        }
        setCouponCode(row.code);
        setAppliedCoupon({ id: row.coupon_id, code: row.code, discount: Number(row.discount) });
      } catch (e: any) {
        clearPendingCoupon();
        if (!cancelled) setCouponError(e?.message ?? "");
      } finally {
        pendingCouponInflight.current = false;
        if (!cancelled) setCouponApplying(false);
      }
    })();
    return () => {
      cancelled = true;
      // A superseding run is about to start (or the page unmounted):
      // unblock it and never leave the UI stuck on "...".
      pendingCouponInflight.current = false;
      setCouponApplying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, appliedCoupon]);

  const applyCoupon = async () => {
    setCouponError(null);
    const code = couponCode.trim();
    if (!code) return;
    setCouponApplying(true);
    try {
      const productIds = Array.from(new Set(cart.map((c) => c.productId)));
      const itemsPayload = cart.map((c) => ({
        productId: c.productId,
        price: c.price,
        quantity: c.quantity,
      }));
      const { data, error } = await supabase.rpc("validate_coupon", {
        _code: code,
        _subtotal: cartTotal,
        _product_ids: productIds,
        _items: itemsPayload as any,
      });
      if (error) throw error;
      const row = data?.[0] as any;
      if (!row?.valid) {
        setCouponError(row?.message || (lang === "ar" ? "كود غير صالح" : "Invalid code"));
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({ id: row.coupon_id, code: row.code, discount: Number(row.discount) });
    } catch (e: any) {
      setCouponError(e.message);
    } finally {
      setCouponApplying(false);
    }
  };
  const removeCoupon = () => {
    clearPendingCoupon();
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(WHATSAPP_NUMBER);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const settings = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => (await supabase.from("site_settings").select("*")).data ?? [],
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
  const checkoutSettings = (settings.data?.find((s: any) => s.key === "checkout")?.value ??
    {}) as any;
  const paymentSettings = (settings.data?.find((s: any) => s.key === "payments")?.value ??
    {}) as any;
  const requireLogin = checkoutSettings.require_login ?? false;
  // تم إزالة خيار الدفع التجريبي نهائيًا
  const instantPaymentEnabled = false;

  const publicPayPalConfig = useQuery({
    queryKey: ["public-paypal-config"],
    queryFn: async () => await getPublicPayPalConfigServerFn(),
    staleTime: 60000,
  });

  // Payment numbers are derived straight from the settings query so a dashboard
  // save (pushed by realtime invalidation) is reflected immediately, and clearing
  // a number in the dashboard actually clears it on the site.
  const settingValue = (key: string) => {
    const raw = settings.data?.find((s: any) => s.key === key)?.value;
    return raw == null ? "" : String(raw);
  };
  const walletNumber = settingValue("wallet_number");
  const instapayNumber = settingValue("instapay_number");
  const paypalEnabledRaw = settings.data?.find((s: any) => s.key === "paypal_enabled")?.value;
  const paypalEnabled =
    paypalEnabledRaw !== undefined
      ? Boolean(paypalEnabledRaw)
      : (publicPayPalConfig.data?.paypalEnabled ?? true);
  const paypalClientId =
    settingValue("paypal_client_id") || publicPayPalConfig.data?.paypalClientId || "";
  const usdRate = Math.max(
    1,
    Number(settingValue("usd_exchange_rate")) || publicPayPalConfig.data?.usdRate || 50,
  );
  const finalTotalUSD = (finalTotal / usdRate).toFixed(2);

  // Preload PayPal SDK as soon as Client ID is fetched for instant button responsiveness & 0ms delay
  useEffect(() => {
    if (!paypalClientId || !paypalClientId.trim()) return;
    const scriptId = "paypal-sdk-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript && existingScript.getAttribute("data-client-id") !== paypalClientId.trim()) {
      existingScript.remove();
      try {
        delete (window as any).paypal;
      } catch { }
    }
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.setAttribute("data-client-id", paypalClientId.trim());
      script.src = `https://www.paypal.com/sdk/js?client-id=${paypalClientId.trim()}&currency=USD&intent=capture&commit=true&enable-funding=card`;
      script.async = true;
      document.head.appendChild(script);
    }
  }, [paypalClientId]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (data.user?.email) setEmail(data.user.email);
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, phone, country")
          .eq("id", data.user.id)
          .maybeSingle();
        const meta: any = data.user.user_metadata ?? {};
        const derived =
          (profile?.display_name && profile.display_name.trim()) ||
          meta.display_name ||
          meta.full_name ||
          meta.name ||
          (data.user.email ? data.user.email.split("@")[0] : "");
        setName(derived || "");
        if (profile?.country) setCountry(profile.country);
        if (profile?.phone) {
          const rawPhone = String(profile.phone).trim();
          const digitsOnly = rawPhone.replace(/\D/g, "");
          const dialCode = dialForCountry(profile?.country || country);
          let localNum = digitsOnly;
          if (
            dialCode &&
            digitsOnly.startsWith(dialCode) &&
            digitsOnly.length > dialCode.length + 5
          ) {
            localNum = digitsOnly.slice(dialCode.length);
          }
          setPhone(localNum);
        }
      }
    });
    syncCart();
  }, [syncCart]);

  const [paypalPendingOrderId, setPaypalPendingOrderId] = useState<string | null>(null);
  const paypalPendingOrderIdRef = useRef<string | null>(null);

  const storePendingPaypalOrderId = (id: string) => {
    paypalPendingOrderIdRef.current = id;
    setPaypalPendingOrderId(id);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("rk_pending_paypal_order_id", id);
      }
    } catch { }
  };

  const getPendingPaypalOrderId = (): string | null => {
    return (
      paypalPendingOrderIdRef.current ||
      paypalPendingOrderId ||
      (typeof window !== "undefined" ? sessionStorage.getItem("rk_pending_paypal_order_id") : null)
    );
  };

  const validateContactForm = (): boolean => {
    if (!name.trim()) {
      showError(
        lang === "ar"
          ? "يرجى كتابة الاسم بالكامل في بيانات التواصل"
          : "Please enter your full name",
      );
      return false;
    }
    if (!email.trim() || !filterEmail(email)) {
      showError(
        lang === "ar"
          ? "يرجى إدخال البريد الإلكتروني بشكل صحيح (مثال: name@domain.com)"
          : "Please enter a valid email address",
      );
      return false;
    }
    if (!country || !country.trim()) {
      showError(
        lang === "ar"
          ? "يرجى اختيار الدولة إجبارياً لإتمام الطلب"
          : "Please select your country to complete your order",
      );
      return false;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 7 || cleanPhone.length > 15 || /^(\d)\1+$/.test(cleanPhone)) {
      showError(
        lang === "ar"
          ? "يرجى كتابة رقم هاتف صحيح عليه واتساب"
          : "Please enter a valid phone number with WhatsApp",
      );
      return false;
    }
    showError(null);
    return true;
  };

  const [paypalProcessingText, setPaypalProcessingText] = useState<string | null>(null);

  const handlePayPalServerCreateOrder = async (): Promise<string> => {
    if (!validateContactForm()) {
      throw new Error(
        lang === "ar"
          ? "يرجى استكمال كافة بيانات التواصل أولاً"
          : "Please fill out all contact info first",
      );
    }

    setPaypalProcessingText(
      lang === "ar"
        ? "جاري تجهيز بوابة الدفع والتحقق من البيانات..."
        : "Preparing secure payment portal...",
    );

    try {
      const existingPending = getPendingPaypalOrderId();
      if (existingPending) {
        await cancelPendingOrderEverywhere(existingPending);
        try {
          sessionStorage.removeItem("rk_pending_paypal_order_id");
        } catch { }
        paypalPendingOrderIdRef.current = null;
        setPaypalPendingOrderId(null);
      }

      const validOrderId: string =
        (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const orderIdToUse = validOrderId;
      const orderNum = validOrderId.slice(0, 8).toUpperCase();

      const { error: oErr } = await supabase.from("orders").insert({
        id: validOrderId,
        order_number: orderNum,
        user_id: user?.id ?? null,
        status: "pending",
        payment_gateway: "paypal" as any,
        subtotal: cartTotal,
        total: finalTotal,
        discount_amount: discount,
        coupon_id: appliedCoupon?.id ?? null,
        customer_email: email,
        customer_name: name.trim() || null,
        customer_phone: phone,
      });
      if (oErr) {
        console.error("Supabase order insert error:", oErr);
        throw new Error(oErr.message || "Failed to create local order");
      }

      const items = cart.flatMap((c) =>
        Array.from({ length: Math.max(1, c.quantity) }, () => ({
          order_id: validOrderId,
          product_id: c.productId,
          plan_id: c.planId,
          product_name: c.productName,
          plan_label: c.planLabel,
          unit_price: c.price,
          frozen_unit_price: c.price,
          quantity: 1,
          delivery_type: c.deliveryType,
          account_type: c.accountType,
          subscription_email: null,
        })),
      );
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      if (appliedCoupon) {
        try {
          await supabase.rpc("redeem_coupon", {
            _coupon_id: appliedCoupon.id,
            _order_id: validOrderId,
            _amount: appliedCoupon.discount,
          });
        } catch (e) {
          console.error("redeem_coupon failed", e);
        }
      }

      storePendingPaypalOrderId(validOrderId);

      const res = await createPayPalOrderServerFn({ data: { orderId: orderIdToUse } });
      return res.paypalOrderId;
    } finally {
      setPaypalProcessingText(null);
    }
  };

  const handlePayPalServerCaptureOrder = async (paypalOrderId: string): Promise<void> => {
    const pendingId = getPendingPaypalOrderId();
    if (!pendingId) {
      throw new Error(
        lang === "ar"
          ? "تعذر العثور على رقم الطلب المحلي المعلق"
          : "PayPal pending order ID not found",
      );
    }

    setSubmitting(true);
    setPaypalProcessingText(
      lang === "ar"
        ? "جاري التحقق من عملية الدفع وإتمام الطلب... يرجى عدم إغلاق الصفحة"
        : "Verifying payment & completing your order... Please do not close this page.",
    );

    try {
      const res = await capturePayPalOrderServerFn({
        data: {
          orderId: pendingId,
          paypalOrderId,
        },
      });

      if (res.ok) {
        try {
          sessionStorage.removeItem("rk_pending_paypal_order_id");
          paypalPendingOrderIdRef.current = null;
        } catch { }
        // Meta Pixel Browser & CAPI Purchase tracking for PayPal
        try {
          trackPurchase({
            orderId: res.orderId,
            total: finalTotal,
            currency: "EGP",
            items: cart.map((c) => ({
              id: c.productId,
              name: c.productName,
              price: c.price,
              quantity: c.quantity,
            })),
          });
          trackMetaCapiServerFn({
            data: {
              eventName: "Purchase",
              eventId: res.orderId,
              userEmail: email,
              userPhone: phone,
              sourceUrl:
                typeof window !== "undefined"
                  ? window.location.href
                  : "https://rapidkeyz.com/checkout",
              customData: {
                value: finalTotal,
                currency: "EGP",
                content_ids: cart.map((c) => c.productId),
                num_items: cart.length,
              },
            },
          }).catch(() => { });
        } catch { }

        clearCart();
        try {
          sessionStorage.setItem(
            "rk-last-order",
            JSON.stringify({
              number: res.orderNumber,
              orderId: res.orderId,
              email,
              total: finalTotal,
              currency: "EGP",
              paymentGateway: "paypal",
              items: cart.map((c) => ({
                name: c.productName,
                mode: c.deliveryType === "instant" ? "instant_pending" : "manual",
              })),
            }),
          );
        } catch { }

        navigate({
          to: "/order-success",
          search: {
            order_id: res.orderId,
            order_number: res.orderNumber,
          },
        });
      } else {
        throw new Error(lang === "ar" ? "فشل تأكيد عملية الدفع" : "Payment capture failed");
      }
    } catch (err: any) {
      console.error("PayPal capture error", err);
      setError(friendlyErrorMessage(err, lang));
    } finally {
      setSubmitting(false);
      setPaypalProcessingText(null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, customGateway?: Gateway, paypalRef?: string) => {
    if (e) e.preventDefault();
    if (submitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    showError(null);
    if (cart.length === 0) {
      isSubmittingRef.current = false;
      return;
    }
    const activeGateway = customGateway || gateway;
    if (!activeGateway) {
      showError(
        lang === "ar"
          ? "يرجى اختيار طريقة الدفع أولاً (محفظة/انستاباي أو PayPal)"
          : "Please select a payment method to proceed",
      );
      isSubmittingRef.current = false;
      return;
    }

    if (activeGateway === "wallet_instapay") {
      if (!proofFile) {
        showError(
          lang === "ar"
            ? "يرجى رفع صورة إثبات الدفع (إيصال التحويل)"
            : "Please upload the payment screenshot",
        );
        isSubmittingRef.current = false;
        return;
      }
      const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      const MAX_BYTES = 5 * 1024 * 1024;
      if (!ALLOWED_MIME.includes(proofFile.type)) {
        showError(
          lang === "ar"
            ? "نوع الملف غير مدعوم. استخدم صورة JPG أو PNG أو PDF"
            : "Unsupported file type. Use JPG, PNG, or PDF",
        );
        isSubmittingRef.current = false;
        return;
      }
      if (proofFile.size > MAX_BYTES) {
        showError(
          lang === "ar"
            ? "حجم الملف كبير جدًا (الحد الأقصى 5 ميجابايت)"
            : "File too large (max 5MB)",
        );
        isSubmittingRef.current = false;
        return;
      }
      const sp = senderPhone.replace(/\D/g, "");
      if (sp.length < 7 || sp.length > 15 || /^(\d)\1+$/.test(sp)) {
        showError(
          lang === "ar"
            ? "برجاء إدخال رقم الهاتف الذي تم التحويل منه بشكل صحيح"
            : "Please enter a valid phone number used for the transfer",
        );
        isSubmittingRef.current = false;
        return;
      }
    }
    if (!validateContactForm()) {
      isSubmittingRef.current = false;
      return;
    }

    // Re-check live stock & prices right before submitting order
    setStockIssues([]);
    setPriceIssues([]);
    try {
      const planIds = Array.from(new Set(cart.map((c) => c.planId)));
      const { data: stockRows, error: stockErr } = await supabase
        .from("product_plans")
        .select(
          `
          id,
          stock,
          price,
          products (
            id,
            discount_percent
          )
        `,
        )
        .in("id", planIds);
      if (stockErr) throw stockErr;

      const planMap = new Map<string, any>((stockRows ?? []).map((r: any) => [r.id as string, r]));

      const requestedMap = new Map<string, number>();
      for (const c of cart) {
        requestedMap.set(c.planId, (requestedMap.get(c.planId) ?? 0) + c.quantity);
      }

      const seenStock = new Set<string>();
      const seenPrice = new Set<string>();
      const sIssues: typeof stockIssues = [];
      const pIssues: typeof priceIssues = [];

      for (const c of cart) {
        const livePlan = planMap.get(c.planId);
        if (!livePlan) continue;

        // Stock check
        if (!seenStock.has(c.planId)) {
          seenStock.add(c.planId);
          const req = requestedMap.get(c.planId) ?? 0;
          const avail = Math.max(0, Number(livePlan.stock ?? 0));
          if (req > avail) {
            sIssues.push({
              planId: c.planId,
              productName: c.productName,
              planLabel: c.planLabel,
              requested: req,
              available: avail,
            });
          }
        }

        // Price check
        if (!seenPrice.has(c.planId)) {
          seenPrice.add(c.planId);
          const rawPrice = Number(livePlan.price ?? 0);
          const discountPercent = Number(livePlan.products?.discount_percent ?? 0);
          const livePrice =
            discountPercent > 0 ? Math.round(rawPrice * (100 - discountPercent)) / 100 : rawPrice;

          if (livePrice !== c.price) {
            pIssues.push({
              planId: c.planId,
              productName: c.productName,
              planLabel: c.planLabel,
              oldPrice: c.price,
              newPrice: livePrice,
            });
          }
        }
      }

      if (sIssues.length > 0 || pIssues.length > 0) {
        setStockIssues(sIssues);
        setPriceIssues(pIssues);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        isSubmittingRef.current = false;
        return;
      }
    } catch (err) {
      console.error("stock/price precheck failed", err);
    }

    setSubmitting(true);
    try {
      let proofUrl: string | null = null;
      if (gateway === "wallet_instapay" && proofFile) {
        const ext = proofFile.name.split(".").pop() || "jpg";
        const folder = user?.id ?? "guest";
        const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs")
          .upload(path, proofFile, { contentType: proofFile.type, upsert: false });
        if (upErr) throw upErr;
        proofUrl = path;
      }

      // Generate the order id client-side so guest checkout doesn't rely on a
      // post-insert SELECT (guest / anon has no SELECT policy on orders).
      const orderId =
        (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const orderNum = orderId.slice(0, 8).toUpperCase();

      const { error: oErr } = await supabase.from("orders").insert({
        id: orderId,
        order_number: orderNum,
        user_id: user?.id ?? null,
        status: "pending",
        payment_gateway: (activeGateway === "simulate" ? "manual" : activeGateway) as any,
        subtotal: cartTotal,
        total: finalTotal,
        discount_amount: discount,
        coupon_id: appliedCoupon?.id ?? null,
        customer_email: email,
        customer_name: name.trim() || null,
        customer_phone: phone,
        payment_proof_url: proofUrl,
        payment_sender_phone:
          activeGateway === "wallet_instapay" ? senderPhone.replace(/\D/g, "") : null,
        payment_reference: paypalRef || (activeGateway === "simulate" ? "SIMULATION" : null),
      });
      if (oErr) throw oErr;

      // Split every quantity>1 into individual order_items so each unit gets
      // its own delivery credentials (one account per unit) and its own status.
      // frozen_unit_price is set explicitly here so historical revenue is not
      // affected by future plan price changes.
      const items = cart.flatMap((c) =>
        Array.from({ length: Math.max(1, c.quantity) }, () => ({
          order_id: orderId,
          product_id: c.productId,
          plan_id: c.planId,
          product_name: c.productName,
          plan_label: c.planLabel,
          unit_price: c.price,
          frozen_unit_price: c.price,
          quantity: 1,
          delivery_type: c.deliveryType,
          account_type: c.accountType,
          subscription_email: null,
        })),
      );
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      // Redeem coupon (best-effort, non-blocking for order success)
      if (appliedCoupon) {
        try {
          await supabase.rpc("redeem_coupon", {
            _coupon_id: appliedCoupon.id,
            _order_id: orderId,
            _amount: appliedCoupon.discount,
          });
        } catch (e) {
          console.error("redeem_coupon failed", e);
        }
      }

      // Every order starts as pending. Admin reviews and delivers each item manually
      // (either by claiming instant inventory or entering credentials for manual items).
      const itemStatuses: {
        name: string;
        mode: "instant_delivered" | "instant_pending" | "manual";
      }[] = items.map((it) => ({
        name: it.product_name,
        mode: it.delivery_type === "instant" ? "instant_pending" : "manual",
      }));

      // Notify admin by email (non-blocking, best-effort)
      // For guest users, we need to ensure notifications are sent immediately
      // as they might not be processed later due to recency checks
      try {
        await notifyNewOrder({ data: { orderId } });
      } catch (e) {
        console.error("notifyNewOrder failed", e);
        // For guest users, try to send notification directly if the first attempt failed
        if (!user) {
          try {
            const { notifyNewOrderDirect } = await import("@/lib/notify-order.functions");
            await notifyNewOrderDirect({ data: { orderId } });
          } catch (directErr) {
            console.error("Direct notifyNewOrder failed", directErr);
          }
        }
      }

      // Notify customer by email (non-blocking, best-effort)
      // This works for both guest and authenticated users
      try {
        await notifyCustomerDelivery({ data: { orderId } });
      } catch (e) {
        console.error("notifyCustomerDelivery failed", e);
        // For guest users, try to send notification directly if the first attempt failed
        if (!user) {
          try {
            const { notifyCustomerDeliveryDirect } = await import("@/lib/notify-order.functions");
            await notifyCustomerDeliveryDirect({ data: { orderId } });
          } catch (directErr) {
            console.error("Direct notifyCustomerDelivery failed", directErr);
          }
        }
      }

      // Meta Pixel Browser & CAPI Purchase tracking
      try {
        trackPurchase({
          orderId,
          total: finalTotal,
          currency: "EGP",
          items: cart.map((c) => ({
            id: c.productId,
            name: c.productName,
            price: c.price,
            quantity: c.quantity,
          })),
        });
        trackMetaCapiServerFn({
          data: {
            eventName: "Purchase",
            eventId: orderId,
            userEmail: email,
            userPhone: phone,
            sourceUrl:
              typeof window !== "undefined"
                ? window.location.href
                : "https://rapidkeyz.com/checkout",
            customData: {
              value: finalTotal,
              currency: "EGP",
              content_ids: cart.map((c) => c.productId),
              num_items: cart.length,
            },
          },
        }).catch(() => { });
      } catch { }

      clearCart();

      // Persist the order summary, then send the customer to a real page
      // (/order-success) so the Meta Pixel can fire PageView + Purchase on a
      // dedicated URL instead of a modal that has no URL of its own.
      try {
        sessionStorage.setItem(
          "rk-last-order",
          JSON.stringify({
            number: orderNum,
            orderId,
            email,
            total: finalTotal,
            currency: "EGP",
            items: itemStatuses,
          }),
        );
      } catch { }
      navigate({
        to: "/order-success",
        search: {
          order_id: orderId,
          order_number: orderNum,
        },
      });
    } catch (err: any) {
      console.error("checkout failed", err);
      setError(friendlyErrorMessage(err, lang));
      // Do NOT clear the cart on failure -the customer needs to be able to
      // retry (fix the payment proof, phone, etc.) without re-adding items.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        {/* ── Cover ── */}
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 28%)",
            }}
          />
          <ShieldCheck
            aria-hidden
            className="pointer-events-none absolute -bottom-8 end-6 size-36 rotate-[-8deg] text-white/25 select-none sm:size-48"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
          />
          <nav
            aria-label="breadcrumb"
            className="absolute top-3 start-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] text-white backdrop-blur-md sm:top-4 sm:start-4 sm:text-xs"
          >
            <Link to="/shop" className="shrink-0 transition hover:text-white/70">
              {lang === "ar" ? "المتجر" : "Shop"}
            </Link>
            <span aria-hidden className="opacity-60">
              /
            </span>
            <span className="max-w-32 truncate font-bold sm:max-w-56">{t.checkout.title}</span>
          </nav>
          <div className="relative px-4 pb-4 pt-12 sm:px-6 sm:pb-6 sm:pt-16">
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md sm:text-xs">
              <ShieldCheck className="size-3.5" />
              {lang === "ar" ? "دفع آمن ومشفر 100%" : "100% secure encrypted checkout"}
            </p>
            <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-md sm:text-3xl">
              {t.checkout.title}
            </h1>
            <p className="mt-1 max-w-2xl truncate text-xs text-white/85 drop-shadow sm:text-sm">
              {lang === "ar"
                ? "كمّل بياناتك وادفع بأمان، التسليم بيبدأ فور تأكيد الطلب."
                : "Finish your details and pay securely, delivery starts right after confirmation."}
            </p>
          </div>
        </div>

        {/* ── Live stats: each card has its own accent so discount & total pop ── */}
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-4 sm:gap-3">
          {[
            {
              n: `${cartCount}`,
              l: lang === "ar" ? "منتج في السلة" : "Items",
              // Icon: ShoppingCart,
              box: "border-border/60 bg-card hover:border-brand/40",
              num: "text-brand-deep",
              chip: "bg-brand/10 text-brand",
            },
            {
              n: `${cartTotal} ${t.common.currency}`,
              l: lang === "ar" ? "المجموع الفرعي" : "Subtotal",
              // Icon: ReceiptText,
              box: "border-border/60 bg-card hover:border-brand/40",
              num: "text-brand-deep",
              chip: "bg-brand/10 text-brand",
            },
            {
              n: discount > 0 ? `−${discount}` : "-",
              l: lang === "ar" ? "الخصم" : "Discount",
              // Icon: BadgePercent,
              box:
                discount > 0
                  ? "border-success/50 bg-success/[0.08] shadow-[0_8px_24px_-12px_var(--success)]"
                  : "border-border/60 bg-card",
              num: discount > 0 ? "text-success" : "text-muted-foreground",
              chip: discount > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            },
            {
              n: `${finalTotal} ${t.common.currency}`,
              l: lang === "ar" ? "الإجمالي" : "Total",
              // Icon: Wallet,
              box: "border-brand/50 bg-gradient-to-b from-brand/[0.16] to-card shadow-[0_10px_28px_-12px_var(--brand)]",
              num: "text-brand-deep",
              chip: "bg-brand text-brand-foreground",
            },
          ].map((s) => (
            <div
              key={s.l}
              className={`relative flex flex-col overflow-hidden rounded-2xl border px-4 py-3 text-center transition sm:py-4 ${s.box}`}
            >
              <dt className="order-2 mt-1.5 flex items-center justify-center gap-1 truncate text-[11px] font-bold text-muted-foreground sm:text-xs">
                {s.l}
              </dt>
              <dd className={`order-1 truncate text-lg font-black tabular-nums sm:text-2xl ${s.num}`}>
                {s.n}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── Steps: sticky tabs that scroll to each section ── */}
        {(() => {
          const s1done =
            name.trim().length > 0 &&
            /.+@.+\..+/.test(email.trim()) &&
            country.trim().length > 0 &&
            phone.replace(/\D/g, "").length >= 7;
          const s2done = !!gateway;
          const current = !s1done ? 0 : !s2done ? 1 : 2;
          const steps = [
            { id: "checkout-contact", label: lang === "ar" ? "بيانات التواصل" : "Contact" },
            { id: "checkout-payment", label: lang === "ar" ? "طريقة الدفع" : "Payment" },
            { id: "checkout-review", label: lang === "ar" ? "مراجعة وتأكيد" : "Review" },
          ];
          return (
            <div
              className="sticky z-30 -mx-3 mt-3 border-y border-border/60 bg-background/95 px-3 backdrop-blur sm:-mx-6 sm:mt-4 sm:px-6"
              style={{ top: "var(--app-header-h, 56px)" }}
            >
              <ol
                className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto no-scrollbar"
                aria-label={lang === "ar" ? "خطوات إتمام الطلب" : "Checkout steps"}
              >
                {steps.map(({ id, label }, i) => {
                  const done = i === 0 ? s1done : i === 1 ? s2done : false;
                  const isCurrent = i === current;
                  return (
                    <li key={id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => scrollToStep(id)}
                        aria-current={isCurrent ? "step" : undefined}
                        className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[15px] ${isCurrent
                          ? "text-brand-deep"
                          : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        {done ? (
                          <span className="grid size-4 place-items-center rounded-full bg-success text-[10px] font-black text-white">
                            ✓
                          </span>
                        ) : (
                          <span className="tabular-nums text-xs opacity-70">{i + 1}</span>
                        )}
                        <span className="whitespace-nowrap">{label}</span>
                        {isCurrent && (
                          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })()}

        {/* ── Feed ── */}
        <div className="py-5 sm:py-7">
          {!user && requireLogin && cart.length > 0 && (
            <div className="mb-6 sm:mb-8 relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-l from-warning/10 to-transparent p-4 sm:p-5 sm:rounded-3xl">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="shrink-0 size-10 sm:size-12 grid place-items-center rounded-2xl bg-warning/15 text-warning text-xl sm:text-2xl">
                  🔒
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm sm:text-base text-foreground mb-0.5">
                    {t.checkout.loginRequired}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {lang === "ar"
                      ? "سجّل دخولك عشان نقدر نحفظ طلبك ونوصّلك بيه."
                      : "Sign in so we can save and deliver your order."}
                  </p>
                </div>
                <SiteButton
                  variant="primary"
                  size="sm"
                  asChild
                  className="shrink-0 whitespace-nowrap"
                >
                  <Link to="/auth" search={{ redirect: "/checkout" }}>
                    {t.auth.signIn}
                  </Link>
                </SiteButton>
              </div>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/70 bg-card px-6 py-14 text-center sm:rounded-3xl">
              <div>
                <p className="font-extrabold">{t.cart.empty}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lang === "ar" ? "سلتك فاضية، اختار خدمتك وارجع كمّل." : "Your cart is empty."}
                </p>
                <SiteButton variant="outline" asChild className="mt-4">
                  <Link to="/shop">{t.cart.goShopping}</Link>
                </SiteButton>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid md:grid-cols-[1fr_360px] gap-6 sm:gap-8">
              <div className="space-y-4 sm:space-y-6 min-w-0 order-2 md:order-1">
                {/* Stock Issues Alert Banner */}
                {stockIssues.length > 0 && (
                  <section className="p-4 sm:p-5 bg-rose-500/10 border-2 border-rose-500/30 dark:bg-rose-950/25 dark:border-rose-800/40 rounded-2xl min-w-0 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 size-10 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 grid place-items-center text-xl font-bold">
                        ⚠️
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-base sm:text-lg text-rose-600 dark:text-rose-400">
                          {lang === "ar" ? "تنبيه: المخزون تغيّـر" : "Stock Change Alert"}
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                          {lang === "ar"
                            ? "الكميات المطلوبة أكبر من المتاح الآن. عدّل سلتك ثم أعد المحاولة."
                            : "Requested quantities exceed current availability. Adjust your cart and try again."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {stockIssues.map((i) => {
                        const itemInCart = cart.find((c) => c.planId === i.planId);
                        return (
                          <div
                            key={i.planId}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/80 rounded-xl p-3.5 shadow-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {itemInCart?.iconUrl ? (
                                <img
                                  src={itemInCart.iconUrl}
                                  alt={i.productName}
                                  className="size-12 rounded-lg object-cover border border-border shrink-0"
                                />
                              ) : (
                                <div className="size-12 rounded-lg bg-muted border border-border shrink-0 grid place-items-center text-xs text-muted-foreground">
                                  📦
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-sm text-foreground truncate">
                                  {i.productName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {i.planLabel}
                                </div>
                                <div className="text-xs font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-muted-foreground">
                                    {lang === "ar"
                                      ? `طلبت ${i.requested}`
                                      : `Requested ${i.requested}`}
                                  </span>
                                  <span className="text-muted-foreground/40">•</span>
                                  <span
                                    className={
                                      i.available > 0
                                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                        : "text-rose-600 dark:text-rose-400 font-bold"
                                    }
                                  >
                                    {lang === "ar"
                                      ? `(المتاح: ${i.available})`
                                      : `(Available: ${i.available})`}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                              {i.available > 0 && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (itemInCart) {
                                      await updateQty(itemInCart.productId, i.planId, i.available);
                                    }
                                    setStockIssues((prev) =>
                                      prev.filter((x) => x.planId !== i.planId),
                                    );
                                  }}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition whitespace-nowrap shadow-sm"
                                >
                                  {lang === "ar"
                                    ? `شراء المتاح (${i.available})`
                                    : `Buy Available (${i.available})`}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (itemInCart) {
                                    removeFromCart(itemInCart.productId, i.planId);
                                  }
                                  setStockIssues((prev) =>
                                    prev.filter((x) => x.planId !== i.planId),
                                  );
                                }}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold transition whitespace-nowrap shadow-sm"
                              >
                                {lang === "ar" ? "إزالة من السلة" : "Remove from cart"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {stockIssues.length > 1 && (
                      <div className="pt-2 border-t border-rose-500/20 flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={async () => {
                            for (const i of stockIssues) {
                              const itemInCart = cart.find((c) => c.planId === i.planId);
                              if (!itemInCart) continue;
                              if (i.available > 0) {
                                await updateQty(itemInCart.productId, i.planId, i.available);
                              } else {
                                removeFromCart(itemInCart.productId, i.planId);
                              }
                            }
                            setStockIssues([]);
                          }}
                          className="w-full sm:w-auto px-6 py-2.5 rounded-xl border-2 border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs sm:text-sm font-bold hover:bg-rose-500/20 transition shadow-sm"
                        >
                          {lang === "ar" ? "تعديل السلة تلقائياً" : "Auto-adjust cart"}
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* Price Change Alert Banner */}
                {priceIssues.length > 0 && (
                  <section className="p-4 sm:p-5 bg-rose-500/10 border-2 border-rose-500/30 dark:bg-rose-950/25 dark:border-rose-800/40 rounded-2xl min-w-0 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 size-10 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 grid place-items-center text-xl font-bold">
                        ⚠️
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-base sm:text-lg text-rose-600 dark:text-rose-400">
                          {lang === "ar" ? "تنبيه: تغيّـر السعر" : "Price Change Alert"}
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                          {lang === "ar"
                            ? "تغيرت أسعار بعض المنتجات في سلتك. يمكنك قبول السعر الجديد ومتابعة الشراء أو إزالة المنتج من السلة."
                            : "Prices for some items in your cart have changed. Accept the new price to continue or remove from cart."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {priceIssues.map((i) => {
                        const itemInCart = cart.find((c) => c.planId === i.planId);
                        return (
                          <div
                            key={i.planId}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/80 rounded-xl p-3.5 shadow-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {itemInCart?.iconUrl ? (
                                <img
                                  src={itemInCart.iconUrl}
                                  alt={i.productName}
                                  className="size-12 rounded-lg object-cover border border-border shrink-0"
                                />
                              ) : (
                                <div className="size-12 rounded-lg bg-muted border border-border shrink-0 grid place-items-center text-xs text-muted-foreground">
                                  📦
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-sm text-foreground truncate">
                                  {i.productName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {i.planLabel}
                                </div>
                                <div className="text-xs font-semibold mt-1 flex items-center gap-2 flex-wrap">
                                  <span className="line-through text-muted-foreground">
                                    {i.oldPrice} {t.common.currency}
                                  </span>
                                  <span className="text-xs text-muted-foreground">➔</span>
                                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                    {i.newPrice} {t.common.currency}
                                  </span>
                                  {i.newPrice < i.oldPrice && (
                                    <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-md">
                                      {lang === "ar" ? "انخفض السعر!" : "Price dropped!"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                              <button
                                type="button"
                                onClick={() => {
                                  if (itemInCart) {
                                    updatePrice(itemInCart.productId, i.planId, i.newPrice);
                                  }
                                  setPriceIssues((prev) =>
                                    prev.filter((x) => x.planId !== i.planId),
                                  );
                                }}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition whitespace-nowrap shadow-sm"
                              >
                                {lang === "ar" ? "متابعة بالسعر الجديد" : "Accept New Price"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (itemInCart) {
                                    removeFromCart(itemInCart.productId, i.planId);
                                  }
                                  setPriceIssues((prev) =>
                                    prev.filter((x) => x.planId !== i.planId),
                                  );
                                }}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold transition whitespace-nowrap shadow-sm"
                              >
                                {lang === "ar" ? "إزالة من السلة" : "Remove from cart"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {priceIssues.length > 1 && (
                      <div className="pt-2 border-t border-rose-500/20 flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            for (const i of priceIssues) {
                              const itemInCart = cart.find((c) => c.planId === i.planId);
                              if (itemInCart) {
                                updatePrice(itemInCart.productId, i.planId, i.newPrice);
                              }
                            }
                            setPriceIssues([]);
                          }}
                          className="w-full sm:w-auto px-6 py-2.5 rounded-xl border-2 border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs sm:text-sm font-bold hover:bg-rose-500/20 transition shadow-sm"
                        >
                          {lang === "ar"
                            ? "تحديث جميع الأسعار ومتابعة الشراء"
                            : "Accept all prices & continue"}
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {/* Prominent High-Visibility Error Banner */}
                {error && (
                  <div
                    id="checkout-error-banner"
                    className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/50 text-rose-600 dark:text-rose-400 shadow-xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-3 duration-300 mb-6"
                  >
                    <div className="size-8 sm:size-9 rounded-xl bg-rose-500/20 text-rose-500 grid place-items-center shrink-0 font-extrabold text-base sm:text-lg">
                      ⚠️
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-extrabold text-sm sm:text-base mb-1 text-rose-600 dark:text-rose-300">
                        {lang === "ar"
                          ? "تنبيه هام: يرجى استكمال أو تصحيح البيانات التالية"
                          : "Important: Please complete or correct the required info"}
                      </h4>
                      <p className="text-xs sm:text-sm font-bold leading-relaxed break-words">
                        {error}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0 p-1"
                      aria-label="Close error"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* 1. Contact Information Section (First) */}
                <section
                  id="checkout-contact"
                  className="min-w-0 scroll-mt-44 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-7"
                >
                  <h2 className="mb-4 flex items-center gap-2.5 text-base font-extrabold sm:text-lg">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-l from-[#0b3fa0] to-[#00a9e0] text-sm font-black text-white shadow-sm">
                      1
                    </span>
                    {t.checkout.contact}
                  </h2>
                  {!user && !requireLogin && (
                    <p className="text-xs text-muted-foreground mb-4">
                      {lang === "ar"
                        ? "تقدر تكمل الشراء كضيف، بس بيانات التواصل ضرورية لتسليم الطلب."
                        : "You can check out as a guest , contact details are required for delivery."}
                    </p>
                  )}
                  <div className="grid gap-3">
                    <input
                      required
                      type="text"
                      placeholder={lang === "ar" ? "الاسم بالكامل" : "Full name"}
                      value={name}
                      onChange={(e) => {
                        setName(filterName(e.target.value));
                        if (error) setError(null);
                      }}
                      className="px-4 py-3 bg-background border border-border rounded-2xl text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                    <div className="space-y-1">
                      <input
                        required
                        type="email"
                        placeholder={
                          lang === "ar"
                            ? "البريد للتواصل، هنبعتلك عليه بيانات الطلب"
                            : "Contact email , we'll send your order details here"
                        }
                        value={email}
                        onChange={(e) => {
                          setEmail(filterEmail(e.target.value));
                          if (error) setError(null);
                        }}
                        className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      <p className="text-xs text-muted-foreground px-1">
                        {lang === "ar"
                          ? "ده الإيميل اللي هيوصلك عليه بيانات الطلب، تقدر تغيّره."
                          : "This is where we'll send your order details , you can change it."}
                      </p>
                    </div>
                    <select
                      required
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        if (error) setError(null);
                      }}
                      className="px-4 py-3 bg-background border border-border rounded-2xl text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    >
                      <option value="">{lang === "ar" ? "اختر الدولة" : "Select country"}</option>
                      {ARAB_COUNTRIES.map((c) => (
                        <option key={c.code} value={lang === "ar" ? c.ar : c.en}>
                          {lang === "ar" ? c.ar : c.en} (+{c.dial})
                        </option>
                      ))}
                    </select>
                    <div
                      dir="ltr"
                      className="flex items-stretch rounded-2xl border border-border bg-background overflow-hidden transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
                    >
                      <span
                        className="px-3 grid place-items-center bg-muted text-sm font-mono font-bold text-muted-foreground select-none"
                        dir="ltr"
                      >
                        +{dialForCountry(country)}
                      </span>
                      <input
                        required
                        type="tel"
                        inputMode="tel"
                        placeholder={
                          lang === "ar"
                            ? "تأكد إن الرقم عليه واتساب"
                            : "Make sure this number has WhatsApp"
                        }
                        value={phone}
                        onChange={(e) => {
                          setPhone(filterDigits(e.target.value, 15));
                          if (error) setError(null);
                        }}
                        className="flex-1 px-4 py-3 bg-transparent outline-none placeholder:text-xs sm:placeholder:text-sm"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </section>

                {/* 2. Payment Method Section (Second) */}
                <section
                  id="checkout-payment"
                  className="min-w-0 scroll-mt-44 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-7"
                >
                  <h2 className="mb-1 flex items-center gap-2.5 text-base font-extrabold sm:text-lg">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-l from-[#0b3fa0] to-[#00a9e0] text-sm font-black text-white shadow-sm">
                      2
                    </span>
                    {t.checkout.payment}
                  </h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    {lang === "ar"
                      ? "اختر طريقة الدفع المناسبة لك لمتابعة الشراء"
                      : "Select your preferred payment method"}
                  </p>
                  {/* Gateway Selector Cards (2 Buttons) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {/* Option 1: Wallet & InstaPay */}
                    <label
                      className={`relative flex items-start gap-3.5 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${gateway === "wallet_instapay"
                        ? "border-brand bg-brand/[0.07] shadow-[0_0_0_1px_var(--brand),0_10px_28px_-12px_var(--brand)]"
                        : "border-border/60 bg-card shadow-sm hover:border-brand/50 hover:shadow-md"
                        }`}
                    >
                      {gateway === "wallet_instapay" && (
                        <span className="absolute top-3 end-3 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-black text-white shadow">
                          ✓
                        </span>
                      )}
                      <input
                        type="radio"
                        name="gateway"
                        checked={gateway === "wallet_instapay"}
                        onChange={() => setGateway("wallet_instapay")}
                        className="accent-brand mt-1 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-extrabold text-sm sm:text-base text-foreground">
                            {lang === "ar" ? "محفظة / انستاباي" : "Wallet / InstaPay"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {lang === "ar"
                            ? "فودافون، اتصالات، أورنج كاش، أو انستاباي"
                            : "Vodafone, Etisalat, Orange Cash, or InstaPay"}
                        </p>
                      </div>
                    </label>

                    {/* Option 2: PayPal */}
                    {paypalEnabled && (
                      <label
                        className={`relative flex items-start gap-3.5 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${gateway === "paypal"
                          ? "border-brand bg-brand/[0.07] shadow-[0_0_0_1px_var(--brand),0_10px_28px_-12px_var(--brand)]"
                          : "border-border/60 bg-card shadow-sm hover:border-brand/50 hover:shadow-md"
                          }`}
                      >
                        {gateway === "paypal" && (
                          <span className="absolute top-3 end-3 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-black text-white shadow">
                            ✓
                          </span>
                        )}
                        <input
                          type="radio"
                          name="gateway"
                          checked={gateway === "paypal"}
                          onChange={() => setGateway("paypal")}
                          className="accent-brand mt-1 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-extrabold text-sm sm:text-base text-foreground">
                              {lang === "ar" ? "PayPal / بطاقة بنكية" : "PayPal / Credit Card"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {lang === "ar"
                              ? "دفع فوري بايبال أو الفيزا / ماستركارد بالدولار"
                              : "Instant payment via PayPal or Visa / MasterCard"}
                          </p>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Prompt if no gateway selected yet */}
                  {!gateway && (
                    <div className="p-5 sm:p-6 rounded-2xl border-2 border-dashed border-brand/35 bg-brand/5 text-center text-xs sm:text-sm font-semibold text-muted-foreground leading-relaxed flex items-center justify-center min-h-[80px] my-3 animate-in fade-in duration-300">
                      {lang === "ar"
                        ? "اضغط على طريقة الدفع المناسبة لك بالأعلى لعرض بيانات وإيصال التحويل"
                        : "Select your payment method above to view transfer details"}
                    </div>
                  )}

                  {/* Details per gateway with smooth micro-animation */}
                  {gateway === "wallet_instapay" && (
                    <div className="space-y-4 p-4 rounded-2xl bg-brand/5 border border-brand/30 min-w-0 overflow-hidden transition-all duration-300 transform animate-in fade-in slide-in-from-top-3 duration-300">
                      <div className="text-sm leading-relaxed break-words">
                        <p className="font-bold mb-2">
                          {lang === "ar" ? "خطوات الدفع:" : "Payment steps:"}
                        </p>
                        <ol className="list-decimal ps-5 space-y-1.5">
                          <li>
                            {lang === "ar" ? (
                              <>حوّل المبلغ المطلوب عبر انستاباي أو المحفظة على الرقم بالأسفل.</>
                            ) : (
                              <>
                                Transfer the required amount via Instapay or Wallet to the number
                                below.
                              </>
                            )}
                          </li>
                          <li>
                            {lang === "ar"
                              ? "ارفع صورة إيصال الدفع واكتب الرقم اللي حولت منه."
                              : "Upload the receipt screenshot and enter the sending number."}
                          </li>
                          <li>
                            {lang === "ar"
                              ? "إيصال الدفع لازم يكون واضح فيه التاريخ و وقت التحويل."
                              : "The payment receipt must clearly show the date and time of the transfer."}
                          </li>
                        </ol>
                      </div>

                      {/* Numbers */}
                      {(() => {
                        const wNum = walletNumber?.trim() || "";
                        const iNum = instapayNumber?.trim() || "";

                        if (!wNum && !iNum) {
                          return (
                            <div className="rounded-xl bg-background border border-brand/40 p-3 space-y-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">
                                {lang === "ar" ? "رقم التحويل" : "Transfer number"}
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  dir="ltr"
                                  className="flex-1 min-w-0 text-center font-mono font-extrabold text-brand text-lg sm:text-xl tracking-widest truncate"
                                >
                                  {WHATSAPP_NUMBER}
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(WHATSAPP_NUMBER);
                                      setWalletCopied(true);
                                      setTimeout(() => setWalletCopied(false), 1500);
                                    } catch { }
                                  }}
                                  className={`shrink-0 text-xs px-3 py-2 rounded-lg font-bold transition ${walletCopied
                                    ? "bg-success/20 text-success"
                                    : "bg-brand/15 text-brand hover:bg-brand/25"
                                    }`}
                                  title={lang === "ar" ? "اضغط للنسخ" : "Click to copy"}
                                >
                                  {walletCopied
                                    ? lang === "ar"
                                      ? "تم ✓"
                                      : "Copied ✓"
                                    : lang === "ar"
                                      ? "نسخ"
                                      : "Copy"}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // If both exist and are identical, combine into a single card
                        if (wNum && iNum && wNum === iNum) {
                          return (
                            <div className="rounded-xl bg-background border border-brand/40 p-3 space-y-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">
                                {lang === "ar"
                                  ? "رقم المحفظة وانستاباي"
                                  : "Wallet & Instapay number"}
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  dir="ltr"
                                  className="flex-1 min-w-0 text-center font-mono font-extrabold text-brand text-lg sm:text-xl tracking-widest truncate"
                                >
                                  {wNum}
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(wNum);
                                      setWalletCopied(true);
                                      setTimeout(() => setWalletCopied(false), 1500);
                                    } catch { }
                                  }}
                                  className={`shrink-0 text-xs px-3 py-2 rounded-lg font-bold transition ${walletCopied
                                    ? "bg-success/20 text-success"
                                    : "bg-brand/15 text-brand hover:bg-brand/25"
                                    }`}
                                  title={lang === "ar" ? "اضغط للنسخ" : "Click to copy"}
                                >
                                  {walletCopied
                                    ? lang === "ar"
                                      ? "تم ✓"
                                      : "Copied ✓"
                                    : lang === "ar"
                                      ? "نسخ"
                                      : "Copy"}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            {wNum ? (
                              <div className="rounded-xl bg-background border border-brand/40 p-3 space-y-2">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">
                                  {lang === "ar" ? "رقم المحفظة" : "Wallet number"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div
                                    dir="ltr"
                                    className="flex-1 min-w-0 text-center font-mono font-extrabold text-brand text-lg sm:text-xl tracking-widest truncate"
                                  >
                                    {wNum}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(wNum);
                                        setWalletCopied(true);
                                        setTimeout(() => setWalletCopied(false), 1500);
                                      } catch { }
                                    }}
                                    className={`shrink-0 text-xs px-3 py-2 rounded-lg font-bold transition ${walletCopied
                                      ? "bg-success/20 text-success"
                                      : "bg-brand/15 text-brand hover:bg-brand/25"
                                      }`}
                                    title={lang === "ar" ? "اضغط للنسخ" : "Click to copy"}
                                  >
                                    {walletCopied
                                      ? lang === "ar"
                                        ? "تم ✓"
                                        : "Copied ✓"
                                      : lang === "ar"
                                        ? "نسخ"
                                        : "Copy"}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {iNum ? (
                              <div className="rounded-xl bg-background border border-brand/40 p-3 space-y-2">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">
                                  {lang === "ar" ? "رقم انستاباي" : "Instapay number"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div
                                    dir="ltr"
                                    className="flex-1 min-w-0 text-center font-mono font-extrabold text-brand text-lg sm:text-xl tracking-widest truncate"
                                  >
                                    {iNum}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(iNum);
                                        setInstapayCopied(true);
                                        setTimeout(() => setInstapayCopied(false), 1500);
                                      } catch { }
                                    }}
                                    className={`shrink-0 text-xs px-3 py-2 rounded-lg font-bold transition ${instapayCopied
                                      ? "bg-success/20 text-success"
                                      : "bg-brand/15 text-brand hover:bg-brand/25"
                                      }`}
                                    title={lang === "ar" ? "اضغط للنسخ" : "Click to copy"}
                                  >
                                    {instapayCopied
                                      ? lang === "ar"
                                        ? "تم ✓"
                                        : "Copied ✓"
                                      : lang === "ar"
                                        ? "نسخ"
                                        : "Copy"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-muted-foreground">
                          {lang === "ar"
                            ? "الرقم الذي تم التحويل منه"
                            : "Phone number you transferred from"}
                        </label>
                        <input
                          required
                          type="tel"
                          value={senderPhone}
                          onChange={(e) => setSenderPhone(filterDigits(e.target.value, 15))}
                          placeholder={lang === "ar" ? "01xxxxxxxxx" : "01xxxxxxxxx"}
                          className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                          dir="ltr"
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-muted-foreground">
                          {lang === "ar" ? "صورة إيصال الدفع" : "Payment receipt screenshot"}
                        </label>
                        <label className="w-full flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-lg cursor-pointer hover:border-brand/60 transition min-w-0">
                          <span className="shrink-0 px-3 py-1.5 rounded-md bg-brand text-brand-foreground text-xs font-bold">
                            {lang === "ar" ? "اختر صورة" : "Choose file"}
                          </span>
                          <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
                            {proofFile?.name ||
                              (lang === "ar" ? "لم يتم اختيار ملف" : "No file selected")}
                          </span>
                          <input
                            required
                            type="file"
                            accept="image/*"
                            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {gateway === "paypal" && (
                    <div className="p-4 rounded-2xl bg-brand/5 border border-brand/30 space-y-4 min-w-0 overflow-hidden transition-all duration-300 transform animate-in fade-in slide-in-from-top-3 duration-300">
                      <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>
                            {lang === "ar" ? "إجمالي الطلب بالجنيه المصري:" : "Total in EGP:"}
                          </span>
                          <span className="font-bold text-foreground">
                            {finalTotal} {t.common.currency}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>{lang === "ar" ? "سعر صرف الدولار:" : "Exchange Rate:"}</span>
                          <span className="font-mono font-bold">1$ = {usdRate} ج.م</span>
                        </div>
                        <div className="pt-2 border-t border-brand/20 flex justify-between items-center">
                          <span className="font-extrabold text-sm sm:text-base text-foreground">
                            {lang === "ar"
                              ? "المبلغ المطلوب بالدولار الامريكي:"
                              : "Total in USD $:"}
                          </span>
                          <span className="font-black text-brand text-xl sm:text-2xl font-mono">
                            ${finalTotalUSD} USD
                          </span>
                        </div>
                      </div>

                      <PayPalButtonsComponent
                        clientId={paypalClientId}
                        onServerCreateOrder={handlePayPalServerCreateOrder}
                        onServerCaptureOrder={handlePayPalServerCaptureOrder}
                        onValidateForm={validateContactForm}
                        onError={(msg) => showError(msg)}
                        lang={lang}
                      />
                    </div>
                  )}
                  {/* Mobile Submit Button (Shown on mobile for non-PayPal gateways at bottom of Payment section) */}
                  {gateway !== "paypal" && (
                    <SiteButton
                      variant="primary"
                      size="lg"
                      type="submit"
                      disabled={submitting || stockIssues.length > 0 || priceIssues.length > 0}
                      className="mt-4 w-full text-base md:hidden"
                    >
                      {submitting
                        ? t.common.loading
                        : stockIssues.length > 0 || priceIssues.length > 0
                          ? lang === "ar"
                            ? "يرجى حل التنبيهات أعلاه للمتابعة"
                            : "Please resolve alerts above to proceed"
                          : t.checkout.placeOrder}
                    </SiteButton>
                  )}
                </section>

                {error && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/50 text-rose-600 dark:text-rose-400 shadow-xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="size-8 sm:size-9 rounded-xl bg-rose-500/20 text-rose-500 grid place-items-center shrink-0 font-extrabold text-base sm:text-lg">
                      ⚠️
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-extrabold text-sm sm:text-base mb-1 text-rose-600 dark:text-rose-300">
                        {lang === "ar"
                          ? "تنبيه هام: يرجى استكمال أو تصحيح البيانات التالية"
                          : "Important: Please complete or correct the required info"}
                      </h4>
                      <p className="text-xs sm:text-sm font-bold leading-relaxed break-words">
                        {error}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0 p-1"
                      aria-label="Close error"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <aside
                id="checkout-review"
                className="h-fit min-w-0 order-1 scroll-mt-44 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6 md:order-2 md:sticky md:top-[calc(var(--app-header-h,56px)+16px)]"
              >
                <h2 className="mb-4 flex items-center gap-2.5 font-extrabold">
                  <span className="hidden size-7 shrink-0 place-items-center rounded-full bg-gradient-to-l from-[#0b3fa0] to-[#00a9e0] text-sm font-black text-white shadow-sm md:grid">
                    3
                  </span>
                  {t.cart.title}
                </h2>
                <div className="space-y-3 mb-4">
                  {cart.map((c) => (
                    <div
                      key={c.productId + c.planId}
                      className="p-3 rounded-2xl border border-border/60 bg-background/60 flex gap-3"
                    >
                      {c.iconUrl ? (
                        <img
                          src={c.iconUrl}
                          alt={c.productName}
                          className="size-14 rounded-xl object-cover border border-border/60 shrink-0"
                        />
                      ) : (
                        <div className="size-14 rounded-xl bg-muted border border-border/60 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{c.productName}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {c.planLabel}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(c.productId, c.planId)}
                            className="grid size-7 shrink-0 self-start place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            aria-label={lang === "ar" ? "حذف" : "Remove"}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center rounded-full border border-border/60 bg-card p-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateQty(c.productId, c.planId, Math.max(1, c.quantity - 1))
                              }
                              className="grid size-7 place-items-center rounded-full text-sm hover:bg-muted disabled:opacity-40"
                              disabled={c.quantity <= 1}
                            >
                              −
                            </button>
                            <span className="px-2 py-1 text-sm font-bold min-w-[2ch] text-center tabular-nums">
                              {c.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(c.productId, c.planId, c.quantity + 1)}
                              className="grid size-7 place-items-center rounded-full text-sm hover:bg-muted"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-bold text-brand text-sm">
                            {c.price * c.quantity} {t.common.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Coupon code */}
                <div className="pt-4 border-t border-border">
                  <label className="text-xs font-bold text-muted-foreground mb-2 block">
                    {lang === "ar" ? "كود الخصم" : "Coupon code"}
                  </label>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-success/10 border border-success/30">
                      <div className="min-w-0">
                        <div className="font-mono font-extrabold text-success text-sm truncate">
                          {appliedCoupon.code}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {lang === "ar" ? "تم تطبيق الخصم" : "Coupon applied"}
                        </div>
                      </div>
                      <SiteButton
                        variant="ghost"
                        size="sm"
                        onClick={removeCoupon}
                        className="shrink-0"
                      >
                        {lang === "ar" ? "إزالة" : "Remove"}
                      </SiteButton>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) =>
                          setCouponCode(e.target.value.toUpperCase().replace(/\s+/g, ""))
                        }
                        placeholder={lang === "ar" ? "أدخل الكود" : "Enter code"}
                        className="flex-1 min-w-0 px-3 py-2.5 bg-background border border-border rounded-2xl font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      <SiteButton
                        variant="primary"
                        size="sm"
                        onClick={applyCoupon}
                        disabled={couponApplying || !couponCode.trim()}
                        className="shrink-0"
                      >
                        {couponApplying ? "..." : lang === "ar" ? "تطبيق" : "Apply"}
                      </SiteButton>
                    </div>
                  )}
                  {couponError && <p className="text-xs text-destructive mt-2">{couponError}</p>}
                </div>

                {gateway === "paypal" && paypalClientId && paypalClientId.trim() ? (
                  <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center text-xs sm:text-sm text-amber-600 dark:text-amber-400 font-bold leading-relaxed">
                    {lang === "ar"
                      ? "يُرجى استكمال عملية الدفع بالضغط على أزرار PayPal بالأعلى"
                      : "Please complete your payment using the PayPal buttons above"}
                  </div>
                ) : (
                  <SiteButton
                    variant="primary"
                    size="lg"
                    type="submit"
                    disabled={submitting || stockIssues.length > 0 || priceIssues.length > 0}
                    className="mt-6 hidden w-full md:inline-flex"
                  >
                    {submitting
                      ? t.common.loading
                      : stockIssues.length > 0 || priceIssues.length > 0
                        ? lang === "ar"
                          ? "يرجى حل التنبيهات أعلاه للمتابعة"
                          : "Please resolve alerts above to proceed"
                        : t.checkout.placeOrder}
                  </SiteButton>
                )}
              </aside>
            </form>
          )}
        </div>

        {/* ── Help band (same as home) ── */}
        {cart.length > 0 && (
          <section className="mb-8 mt-2 overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] p-5 text-white sm:mb-10 sm:rounded-3xl sm:p-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-extrabold sm:text-2xl">
                  {lang === "ar" ? "واجهتك مشكلة في الدفع؟" : "Trouble paying?"}
                </h2>
                <p className="mt-1 text-xs text-white/85 sm:text-sm">
                  {lang === "ar"
                    ? "ابعتلنا على واتساب وهنساعدك تكمّل طلبك خطوة بخطوة."
                    : "Message us on WhatsApp and we'll walk you through your order."}
                </p>
              </div>
              {(contact.data?.whatsapp ?? "").replace(/[^\d]/g, "") ? (
                <a
                  href={`https://wa.me/${(contact.data?.whatsapp ?? "").replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3fa0] transition hover:brightness-95 active:scale-95"
                >
                  <WhatsAppIcon className="size-4" />
                  {lang === "ar" ? "مساعدة واتساب" : "WhatsApp help"}
                </a>
              ) : (
                <Link
                  to="/shop"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3fa0] transition hover:brightness-95 active:scale-95"
                >
                  <Store className="size-4" />
                  {lang === "ar" ? "تصفح المتجر" : "Browse shop"}
                </Link>
              )}
            </div>
          </section>
        )}
      </div>

      {/* High-End Processing & Loading Overlay rendered at document.body level for 100% viewport centering */}
      {(submitting || paypalProcessingText) &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#0a2a5e]/60 p-4 backdrop-blur-sm sm:p-6 animate-in fade-in duration-200 top-0 left-0 right-0 bottom-0 pointer-events-auto">
            <div className="my-auto flex w-full max-w-sm flex-col items-center space-y-4 rounded-3xl border border-brand/20 bg-card p-6 text-center shadow-xl sm:p-8">
              <div className="relative my-2 flex items-center justify-center">
                <div className="h-14 w-14 animate-spin rounded-full border-4 border-brand/20 border-t-brand sm:h-16 sm:w-16" />
              </div>
              <h3 className="text-base font-extrabold leading-snug text-foreground sm:text-lg">
                {paypalProcessingText ||
                  (lang === "ar"
                    ? "جاري معالجة الطلب وإتمام العملية..."
                    : "Processing your order...")}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {lang === "ar"
                  ? "يرجى الانتظار ولُطفاً عدم إغلاق أو تحديث هذه الصفحة أثناء تنفيذ العملية..."
                  : "Please wait and do not refresh or close this page while we complete your transaction..."}
              </p>
            </div>
          </div>,
          document.body,
        )}

      <Footer />
    </div>
  );
}
