import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { SiteButton } from "@/components/ui/site-button";
import { Check, CreditCard, Download, Mail, Phone, Receipt, ShoppingBag, Trash2, Truck, User, X } from "lucide-react";
import { AdminHero, HeroAction } from "@/components/AdminHero";
import { showError } from "@/lib/error-handler";
import { notifyItemDelivered } from "@/lib/notify-order.functions";
import { deliverItemManual, deliverItemFromStock } from "@/lib/deliver-order.functions";

import { markInventorySoldOnSheet } from "@/lib/sheet-sync.functions";
import { dialForCountry } from "@/lib/arab-countries";
import { Input } from "@/components/ui/input";
import { deliveredList } from "@/lib/delivered";
import { getOrderStatusConfig } from "@/lib/order-status";
import { matchesSearchQuery } from "@/lib/search-utils";

// Build a wa.me-safe number: prepend country dial code when the phone was
// entered in local form (e.g. "010..." or "10..."). Handles cases where the
// dial is already there so we never double-prefix.
function buildWaNumber(phone: string, country?: string | null): string {
  const dial = dialForCountry(country ?? "");
  let digits = String(phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (dial && digits.startsWith(dial)) return digits;
  digits = digits.replace(/^0+/, "");
  return `${dial}${digits}`;
}

export const Route = createFileRoute("/_authenticated/admin/orders")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    // Admins and moderators can both open the orders page (destructive
    // actions below stay admin-only).
    const canAccess = roles?.some((r) => r.role === "admin" || r.role === "moderator");
    if (!canAccess) throw redirect({ to: "/admin/products" });
    return { roles };
  },
  component: AdminOrders,
});

const STATUSES = ["pending", "paid", "processing", "delivered", "cancelled", "refunded"] as const;
// "refunded" must not be set manually -it's driven by the refunds flow to keep totals consistent.
const MANUAL_STATUSES = STATUSES.filter((s) => s !== "refunded");

type Tab = "all" | "expiring";

function AdminOrders() {
  const { t, lang, confirm, notify } = useApp();
  const qc = useQueryClient();
  const { roles } = Route.useRouteContext();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [flagFilter, setFlagFilter] = useState<
    "all" | "coupon" | "refund" | "refund_partial" | "refund_full" | "clean"
  >("all");
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [currentAction, setCurrentAction] = useState<"clearAll" | "deleteOrder" | null>(null);
  const currentOrderToDeleteRef = useRef<string | null>(null);
  const isAdmin = roles?.some((r: { role: string }) => r.role === "admin") ?? false;

  const orders = useQuery({
    queryKey: ["admin-orders"],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, coupons(code, discount_type, discount_value), order_items(*, unit_price, frozen_unit_price, product_plans(duration_days, plan_variant, price, compare_price, label_ar, label_en), products(slug, name_ar, name_en, cover_url, icon_url), delivered_accounts(*)), refunds(id, amount, type, order_item_id)",
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching admin orders:", error);
        throw error;
      }
      return data ?? [];
    },
  });

  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const openProof = async (path: string) => {
    setProofLoading(true);
    setProofPreview("__loading__");
    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(path, 3600);
    setProofLoading(false);
    if (error || !data?.signedUrl) {
      setProofPreview(null);
      notify(
        error?.message ?? (lang === "ar" ? "تعذّر فتح إثبات الدفع" : "Failed to open proof"),
        "error",
      );
      return;
    }
    setProofPreview(data.signedUrl);
  };

  // Compute per-order min days-remaining (over items actually delivered to the customer)
  const expiring = useMemo(() => {
    const now = Date.now();
    return (orders.data ?? []).map((o: any) => {
      let minDays = Infinity;
      for (const it of o.order_items ?? []) {
        const dur = Number(it.product_plans?.duration_days ?? 0);
        const dAcc = deliveredList(it.delivered_accounts)[0];
        // Only count items that were actually delivered to the customer
        if (!dAcc) continue;
        const startAt = new Date(dAcc.delivered_at).getTime();
        if (dur > 0) {
          const endAt = startAt + dur * 86400_000;
          const days = Math.ceil((endAt - now) / 86400_000);
          if (days < minDays) minDays = days;
        }
      }
      return { order: o, minDays: minDays === Infinity ? null : minDays };
    });
  }, [orders.data]);

  const visible = useMemo(() => {
    // Start with all orders, filtering out unpaid PayPal attempts
    let list = expiring.filter(({ order: o }) => {
      if (!o) return false;
      // Exclude abandoned/unpaid PayPal orders (only display successfully paid PayPal orders)
      if (o.payment_gateway === "paypal") {
        const isPaid =
          o.status === "paid" ||
          o.status === "delivered" ||
          o.status === "completed" ||
          o.payment_status === "PAID";
        if (!isPaid) return false;
      }
      return true;
    });

    // Apply tab filter
    if (tab === "expiring") {
      list = list
        .filter(
          ({ order: o, minDays }) =>
            minDays !== null && minDays <= 30 && minDays > -365 && o.status === "delivered",
        )
        .sort((a, b) => (a.minDays ?? 0) - (b.minDays ?? 0));
    }

    // Apply status filter
    if (statusFilter !== "all") {
      list = list.filter(({ order: o }: any) => o.status === statusFilter);
    }

    // Apply flag filter
    if (flagFilter !== "all") {
      list = list.filter(({ order: o }: any) => {
        const hasCoupon = Number(o.discount_amount ?? 0) > 0 || !!o.coupons?.code;
        const refundTotal = (o.refunds ?? []).reduce(
          (s: number, r: any) => s + Number(r.amount ?? 0),
          0,
        );
        const hasRefund = refundTotal > 0;
        const isFullRefund = hasRefund && refundTotal >= Number(o.total ?? 0) - 0.001;
        if (flagFilter === "coupon") return hasCoupon;
        if (flagFilter === "refund") return hasRefund;
        if (flagFilter === "refund_partial") return hasRefund && !isFullRefund;
        if (flagFilter === "refund_full") return isFullRefund;
        if (flagFilter === "clean") return !hasCoupon && !hasRefund;
        return true;
      });
    }

    // Apply search filter
    if (search.trim()) {
      list = list.filter(({ order: o }: any) => {
        const itemNames = (o.order_items ?? [])
          .map(
            (it: any) =>
              `${it.products?.name_ar ?? ""} ${it.products?.name_en ?? ""} ${it.product_plans?.label_ar ?? ""} ${it.product_plans?.label_en ?? ""}`,
          )
          .join(" ");
        const hay = `${o.order_number ?? ""} ${o.customer_email ?? ""} ${o.customer_phone ?? ""} ${o.customer_name ?? ""} ${o.notes ?? ""} ${itemNames}`;
        return matchesSearchQuery(hay, search);
      });
    }

    // Deduplicate orders strictly by ID / order_number
    const seen = new Set<string>();
    const deduplicatedList: typeof list = [];
    for (const item of list) {
      const key = item.order.id || item.order.order_number;
      if (key && !seen.has(key)) {
        seen.add(key);
        deduplicatedList.push(item);
      }
    }

    return deduplicatedList;
  }, [expiring, tab, search, statusFilter, flagFilter]);

  const profilesMap = useQuery({
    queryKey: [
      "admin-orders-profiles",
      (orders.data ?? [])
        .map((o: any) => o.user_id)
        .filter(Boolean)
        .join(","),
    ],
    enabled: !!orders.data?.length,
    queryFn: async () => {
      const ids = Array.from(
        new Set((orders.data ?? []).map((o: any) => o.user_id).filter(Boolean)),
      );
      const map = new Map<string, any>();
      if (!ids.length) return map;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, phone, country")
        .in("id", ids);
      (data ?? []).forEach((p: any) => map.set(p.id, p));
      return map;
    },
  });

  const exportOrdersXlsx = () => {
    const rows: any[] = [];
    visible.forEach(({ order: o }: any) => {
      const prof = profilesMap.data?.get(o.user_id) ?? {};
      const items = o.order_items ?? [];
      const subtotal = Number(o.subtotal ?? 0);
      const discountAmount = Number(o.discount_amount ?? 0);
      const couponCode = o.coupons?.code ?? "";
      const couponInfo =
        o.coupons?.discount_type === "percent"
          ? `${o.coupons?.discount_value ?? ""}%`
          : o.coupons?.discount_type === "fixed"
            ? `${o.coupons?.discount_value ?? ""} EGP`
            : "";
      if (!items.length) {
        rows.push({
          "رقم الطلب": o.order_number,
          "اسم العميل": o.customer_name ?? prof.display_name ?? "",
          البريد: o.customer_email ?? "",
          "رقم الواتساب": o.customer_phone ?? prof.phone ?? "",
          الدولة: prof.country ?? "",
          الحالة: o.status,
          "الإجمالي قبل الخصم": subtotal,
          "كود الخصم": couponCode,
          "نوع/قيمة الكود": couponInfo,
          "قيمة الخصم": discountAmount,
          "الإجمالي بعد الخصم": Number(o.total ?? 0),
          "طريقة الدفع": o.payment_gateway ?? "",
          "رقم المرسل": o.payment_sender_phone ?? "",
          الخدمة: "",
          الخطة: "",
          الكمية: "",
          "سعر الوحدة": "",
          التاريخ: new Date(o.created_at).toLocaleDateString("en-GB"),
          الوقت: new Date(o.created_at).toLocaleTimeString("en-GB", { hour12: true }),
          ملاحظات: o.notes ?? "",
        });
        return;
      }
      // Compute proportional discount per item (matches refunds logic)
      const totalItemsValue = items.reduce(
        (s: number, it: any) =>
          s + Number(it.frozen_unit_price ?? it.unit_price ?? 0) * Number(it.quantity ?? 1),
        0,
      );
      items.forEach((it: any) => {
        const gross = Number(it.frozen_unit_price ?? it.unit_price ?? 0) * Number(it.quantity ?? 1);
        const itemDiscount =
          totalItemsValue > 0 && discountAmount > 0
            ? Math.round((gross / totalItemsValue) * discountAmount * 100) / 100
            : 0;
        const netUnit =
          it.quantity > 0
            ? Math.round(((gross - itemDiscount) / Number(it.quantity)) * 100) / 100
            : Number(it.frozen_unit_price ?? it.unit_price ?? 0);
        rows.push({
          "رقم الطلب": o.order_number,
          "اسم العميل": o.customer_name ?? prof.display_name ?? "",
          البريد: o.customer_email ?? "",
          "رقم الواتساب": o.customer_phone ?? prof.phone ?? "",
          الدولة: prof.country ?? "",
          الحالة: o.status,
          "الإجمالي قبل الخصم": subtotal,
          "كود الخصم": couponCode,
          "نوع/قيمة الكود": couponInfo,
          "قيمة الخصم": discountAmount,
          "الإجمالي بعد الخصم": Number(o.total ?? 0),
          "طريقة الدفع": o.payment_gateway ?? "",
          "رقم المرسل": o.payment_sender_phone ?? "",
          الخدمة: it.product_name,
          الخطة: it.plan_label,
          الكمية: it.quantity,
          "سعر الوحدة قبل الخصم": Number(it.frozen_unit_price ?? it.unit_price ?? 0),
          "سعر الوحدة بعد الخصم": netUnit,
          التاريخ: new Date(o.created_at).toLocaleDateString("en-GB"),
          الوقت: new Date(o.created_at).toLocaleTimeString("en-GB", { hour12: true }),
          ملاحظات: o.notes ?? "",
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    const rawTitle = (document.title || "orders").split(/[,–|:-]/)[0];
    const siteName = rawTitle.replace(/[\\/:*?"<>|]+/g, "").trim() || "orders";
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const suffix = statusFilter === "all" ? `all-${today}` : `${statusFilter}-${today}`;
    XLSX.writeFile(wb, `${siteName} - orders - ${suffix}.xlsx`);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      notify(lang === "ar" ? "تم تحديث الحالة" : "Status updated", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const translateDeliverError = (e: any) => {
    const msg = String(e?.message ?? "");
    if (msg.includes("ALREADY_DELIVERED"))
      return new Error(
        lang === "ar" ? "تم تسليم هذا العنصر بالفعل" : "This item has already been delivered",
      );
    if (msg.includes("NO_INVENTORY"))
      return new Error(
        lang === "ar"
          ? "لا يوجد مخزون متاح -سلّم يدويًا"
          : "No inventory available -deliver manually",
      );
    return e;
  };

  // Both delivery paths run entirely server-side (service role), so writing the
  // credentials, flipping the item status and emailing the customer can't be
  // blocked by browser-side table grants / RLS.
  const deliver = useMutation({
    mutationFn: async ({ orderItemId, creds }: { orderItemId: string; creds: any }) => {
      try {
        return await deliverItemManual({ data: { orderItemId, creds } });
      } catch (e) {
        throw translateDeliverError(e);
      }
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      if (res?.emailSent) {
        notify(lang === "ar" ? "تم التسليم وإرسال الإيميل" : "Delivered & emailed", "success");
      } else {
        const errDetail = res?.emailError ? ` (${res.emailError})` : "";
        notify(
          (lang === "ar" ? "تم التسليم لكن الإيميل فشل" : "Delivered but email failed") + errDetail,
          "error",
        );
      }
    },
    onError: (e) => showError(e, notify, lang),
  });

  const deliverInstant = useMutation({
    mutationFn: async ({ orderItemId, planId }: { orderItemId: string; planId: string }) => {
      let res: any;
      try {
        res = await deliverItemFromStock({ data: { orderItemId, planId } });
      } catch (e) {
        throw translateDeliverError(e);
      }
      if (res?.inventoryId) {
        try {
          await markInventorySoldOnSheet({ data: { inventoryId: res.inventoryId as string } });
        } catch (e) {
          console.error("markInventorySoldOnSheet failed", e);
        }
      }
      return res;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      if (res?.emailSent) {
        notify(
          lang === "ar" ? "تم التسليم الفوري وإرسال الإيميل" : "Delivered from inventory & emailed",
          "success",
        );
      } else {
        const errDetail = res?.emailError ? ` (${res.emailError})` : "";
        notify(
          (lang === "ar" ? "تم التسليم لكن الإيميل فشل" : "Delivered but email failed") + errDetail,
          "error",
        );
      }
    },
    onError: (e) => showError(e, notify, lang),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      // Verify password before proceeding
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");

      // Get the stored admin password from site settings
      const { data: passwordData, error: passwordError } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (passwordError) throw passwordError;
      if (!passwordData?.value)
        throw new Error(lang === "ar" ? "لم يتم تعيين باسورد إداري" : "Admin password not set");

      // Verify the entered password
      if (password !== passwordData.value) {
        throw new Error(lang === "ar" ? "الباسورد غير صحيح" : "Incorrect password");
      }

      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      notify(lang === "ar" ? "تم حذف الطلب" : "Order deleted", "success");
      setShowPasswordInput(false);
      setPassword("");
    },
    onError: (e) => {
      showError(e, notify, lang);
      setPassword("");
    },
  });

  const clearAllOrders = useMutation({
    mutationFn: async () => {
      // Verify password before proceeding
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");

      // Get the stored admin password from site settings
      const { data: passwordData, error: passwordError } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (passwordError) throw passwordError;
      if (!passwordData?.value)
        throw new Error(lang === "ar" ? "لم يتم تعيين باسورد إداري" : "Admin password not set");

      // Verify the entered password
      if (password !== passwordData.value) {
        throw new Error(lang === "ar" ? "الباسورد غير صحيح" : "Incorrect password");
      }

      const { error } = await supabase.from("orders").delete().not("id", "is", null);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onSuccess: () => {
      notify(lang === "ar" ? "تم مسح كل الطلبات" : "All orders cleared", "success");
      setPassword("");
      setShowPasswordInput(false);
    },
    onError: (e) => {
      showError(e, notify, lang);
      setPassword("");
    },
  });

  const handlePasswordSubmit = async () => {
    if (!password) {
      notify(lang === "ar" ? "يجب إدخال الباسورد" : "Password is required", "error");
      return;
    }

    if (currentAction === "clearAll") {
      clearAllOrders.mutate();
    } else if (currentAction === "deleteOrder" && currentOrderToDeleteRef.current) {
      deleteOrder.mutate(currentOrderToDeleteRef.current);
    }
  };

  const askClearAll = async () => {
    const ok = await confirm({
      title: lang === "ar" ? "مسح كل الطلبات" : "Clear all orders",
      message:
        lang === "ar"
          ? "سيتم حذف كل الطلبات نهائياً مع كل تفاصيلها. هذه العملية لا يمكن التراجع عنها. هل تريد المتابعة؟"
          : "All orders and their details will be permanently deleted. This action cannot be undone. Do you want to continue?",
      tone: "danger",
    });
    if (!ok) return;

    // تعيين نوع العملية وإظهار مربع إدخال الباسورد
    setCurrentAction("clearAll");
    setShowPasswordInput(true);
    setPassword("");
  };

  return (
    <div>
      <AdminHero
        icon={ShoppingBag}
        title={t.admin.orders}
        subtitle={
          lang === "ar"
            ? `${visible.length} طلب • إدارة الطلبات والتسليم`
            : `${visible.length} orders • manage & deliver`
        }
        actions={
          <HeroAction onClick={exportOrdersXlsx}>
            <Download className="size-4" />
            {lang === "ar" ? "تحميل Excel" : "Export Excel"}
          </HeroAction>
        }
      />
      <div className="h-3 sm:h-4" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex rounded-full border border-border/60 bg-card p-1 w-full sm:w-auto overflow-x-auto shadow-sm">
          {(
            [
              { k: "all", label: "كل الطلبات" },
              { k: "expiring", label: "خدمات شارفت على الانتهاء" },
            ] as const
          ).map((x) => (
            <button
              key={x.k}
              onClick={() => setTab(x.k)}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2 text-xs sm:text-sm font-extrabold rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap ${tab === x.k
                ? "bg-brand text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            lang === "ar"
              ? "بحث برقم الطلب أو الاسم أو الإيميل أو الواتساب..."
              : "Search by order #, name, email or phone..."
          }
          className="flex-1 px-4 py-2.5 bg-background border border-border rounded-lg text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-bold"
        >
          <option value="all">كل الحالات (All Statuses)</option>
          {STATUSES.map((s) => {
            const cfg = getOrderStatusConfig(s, lang);
            return (
              <option key={s} value={s}>
                {cfg.label}
              </option>
            );
          })}
        </select>
        <select
          value={flagFilter}
          onChange={(e) => setFlagFilter(e.target.value as any)}
          className="px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-bold"
          title="فلترة حسب الكوبون / التعويض"
        >
          <option value="all">الكل (كوبون/تعويض)</option>
          <option value="coupon">🎟️ عليه كوبون</option>
          <option value="refund">↩️ عليه تعويض</option>
          <option value="refund_partial">↩️ تعويض جزئي</option>
          <option value="refund_full">↩️ تعويض كلي</option>
          <option value="clean">بدون كوبون/تعويض</option>
        </select>
        {isAdmin && (
          <>
            <button
              onClick={askClearAll}
              disabled={clearAllOrders.isPending || !orders.data?.length}
              className="px-4 py-2.5 rounded-lg font-bold text-sm border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 whitespace-nowrap"
            >
              {clearAllOrders.isPending
                ? lang === "ar"
                  ? "جارٍ المسح..."
                  : "Clearing..."
                : lang === "ar"
                  ? "مسح كل الطلبات"
                  : "Clear all orders"}
            </button>

            {showPasswordInput &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in"
                  onClick={() => {
                    setShowPasswordInput(false);
                    setPassword("");
                    setCurrentAction(null);
                  }}
                >
                  <div
                    className="bg-card border border-border rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative my-auto animate-in zoom-in-95 duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-lg font-bold mb-2 text-foreground">
                      {lang === "ar" ? "مسح كل الطلبات" : "Clear all orders"}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-relaxed">
                      {currentAction === "clearAll"
                        ? lang === "ar"
                          ? "أدخل الباسورد الإداري لمسح كل الطلبات:"
                          : "Enter admin password to clear all orders:"
                        : lang === "ar"
                          ? "أدخل الباسورد الإداري لحذف الطلب:"
                          : "Enter admin password to delete order:"}
                    </p>
                    <Input
                      type="password"
                      placeholder={lang === "ar" ? "الباسورد الإداري" : "Admin password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full mb-5"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handlePasswordSubmit();
                        }
                      }}
                    />
                    <div className="flex gap-2.5 justify-end">
                      <button
                        onClick={() => {
                          setShowPasswordInput(false);
                          setPassword("");
                          setCurrentAction(null);
                        }}
                        className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl font-bold text-xs sm:text-sm hover:bg-muted/80 transition"
                      >
                        {lang === "ar" ? "إلغاء" : "Cancel"}
                      </button>
                      <button
                        onClick={handlePasswordSubmit}
                        className="px-5 py-2.5 bg-destructive text-destructive-foreground rounded-xl font-bold text-xs sm:text-sm hover:bg-destructive/90 transition shadow-md"
                      >
                        {currentAction === "clearAll"
                          ? lang === "ar"
                            ? "مسح كل الطلبات"
                            : "Clear all orders"
                          : lang === "ar"
                            ? "حذف الطلب"
                            : "Delete order"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </>
        )}
      </div>

      {tab === "expiring" && (
        <p className="text-xs text-muted-foreground mb-4">
          كل خدمة فاضل عليها شهر أو أقل قبل الانتهاء. الحساب بيبدأ من تاريخ التسليم الفعلي، أو من
          تاريخ الطلب لو لسه ما اتسلمش.
        </p>
      )}

      <div className="space-y-3">
        {visible.map(({ order: o, minDays }) => {
          const refundTotal = (o.refunds ?? []).reduce(
            (s: number, r: any) => s + Number(r.amount ?? 0),
            0,
          );
          const hasRefund = refundTotal > 0;
          const isFullRefund = hasRefund && refundTotal >= Number(o.total ?? 0) - 0.001;
          const hasCoupon = Number(o.discount_amount ?? 0) > 0 || !!o.coupons?.code;
          const statusCfg = getOrderStatusConfig(o.status, lang);
          const accentClass = statusCfg.cardClass;
          return (
            <div
              key={o.id}
              className={`bg-card border rounded-2xl overflow-hidden transition-all ${accentClass}`}
            >
              <div className="p-4 flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2 flex-wrap">
                    <span>#{o.order_number}</span>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-black flex items-center gap-1 ${statusCfg.badgeClass}`}
                    >
                      {statusCfg.label}
                    </span>
                    {hasRefund && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${isFullRefund ? "bg-destructive text-destructive-foreground" : "bg-destructive/15 text-destructive"}`}
                      >
                        {isFullRefund ? "↩️ تعويض كلي" : "↩️ تعويض جزئي"} -{refundTotal} EGP
                      </span>
                    )}
                    {hasCoupon && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-success/15 text-success font-bold">
                        🎟️ كوبون {o.coupons?.code ? `· ${o.coupons.code}` : ""}{" "}
                        {Number(o.discount_amount ?? 0) > 0 ? `−${o.discount_amount} EGP` : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground break-all mt-1">
                    {new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
                      hour12: true,
                    })}{" "}
                    · {o.customer_email}
                  </div>
                  {minDays !== null && (
                    <div
                      className={`text-xs font-bold mt-1 ${minDays < 0
                        ? "text-destructive"
                        : minDays <= 7
                          ? "text-destructive"
                          : minDays <= 30
                            ? "text-warning"
                            : "text-muted-foreground"
                        }`}
                    >
                      {minDays < 0 ? ` انتهت من ${Math.abs(minDays)} يوم` : ` باقي ${minDays} يوم`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus.mutate({ id: o.id, status: e.target.value })}
                    className={`px-3 py-1.5 bg-background border rounded-lg text-sm font-bold cursor-pointer transition-all ${statusCfg.badgeClass}`}
                  >
                    {MANUAL_STATUSES.map((s) => {
                      const cfg = getOrderStatusConfig(s, lang);
                      return (
                        <option key={s} value={s} className="bg-card text-foreground font-bold">
                          {cfg.label}
                        </option>
                      );
                    })}
                    {o.status === "refunded" && (
                      <option value="refunded" className="bg-card text-purple-400 font-bold">
                        تم الاسترداد (Refunded)
                      </option>
                    )}
                  </select>
                  <span className="font-extrabold text-brand">{o.total} EGP</span>
                  <button
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                    className="text-brand text-sm hover:underline"
                  >
                    {expanded === o.id ? "Hide" : "Manage"}
                  </button>
                </div>
              </div>
              {expanded === o.id &&
                (() => {
                  const prof = profilesMap.data?.get(o.user_id) ?? {};
                  const itemsCount = (o.order_items ?? []).reduce(
                    (s: number, it: any) => s + Number(it.quantity ?? 0),
                    0,
                  );
                  const orderPill =
                    o.status === "delivered"
                      ? "border-success/30 bg-success/10 text-success"
                      : o.status === "paid"
                        ? "border-brand/30 bg-brand/10 text-brand"
                        : o.status === "processing" || o.status === "pending"
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : o.status === "refunded" || o.status === "cancelled"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-border bg-muted text-muted-foreground";
                  return (
                    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                      {/* Header strip */}
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-3">
                        <span className="rounded-lg bg-brand/10 px-2.5 py-1 font-mono text-xs font-black text-brand">
                          #{o.order_number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {o.customer_email} •{" "}
                          {new Date(o.created_at).toLocaleString(
                            lang === "ar" ? "ar-EG" : "en-US",
                            { hour12: true },
                          )}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${orderPill}`}
                        >
                          {o.status}
                        </span>
                        <span className="shrink-0 text-base font-black tabular-nums">
                          {o.total} EGP
                        </span>
                      </div>

                      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="min-w-0 space-y-4">
                          {/* Customer card */}
                          <div>
                            <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                              <span className="h-4 w-1 rounded-full bg-brand" />
                              {lang === "ar" ? "العميل" : "Customer"}
                            </h4>
                            <div className="grid gap-2 rounded-2xl border border-border/60 bg-background/50 p-3.5 text-sm sm:grid-cols-2">
                              <p className="flex min-w-0 items-center gap-2">
                                <User className="size-4 shrink-0 text-brand" />
                                <span className="truncate font-bold">
                                  {o.customer_name || prof.display_name || "-"}
                                </span>
                                {o.user_id ? (
                                  <span className="shrink-0 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-black text-brand">
                                    مسجّل
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                                    زائر
                                  </span>
                                )}
                              </p>
                              <p className="flex min-w-0 items-center gap-2">
                                <Mail className="size-4 shrink-0 text-brand" />
                                <span className="truncate font-mono text-[13px]">
                                  {o.customer_email}
                                </span>
                              </p>
                              <p className="flex min-w-0 items-center gap-2">
                                <Phone className="size-4 shrink-0 text-brand" />
                                <span className="truncate font-mono text-[13px]">
                                  {o.customer_phone || "-"}
                                </span>
                                {o.customer_phone &&
                                  (() => {
                                    const wa = buildWaNumber(o.customer_phone, prof.country);
                                    return (
                                      <a
                                        href={`https://wa.me/${wa}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={`wa.me/${wa}`}
                                        className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-black text-success transition hover:brightness-95"
                                      >
                                        واتساب (+{wa})
                                      </a>
                                    );
                                  })()}
                              </p>
                              <p className="flex min-w-0 items-center gap-2 text-sm">
                                <span className="shrink-0 text-muted-foreground">الدولة:</span>
                                <span className="truncate font-bold">{prof.country || "-"}</span>
                                <span className="ms-auto shrink-0 text-muted-foreground">
                                  الوحدات: <b className="text-foreground">{itemsCount}</b>
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Financial card */}
                          <div>
                            <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                              <span className="h-4 w-1 rounded-full bg-brand" />
                              {lang === "ar" ? "المالية" : "Payment"}
                            </h4>
                            <div className="rounded-2xl border border-border/60 bg-background/50 p-3.5 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">قبل الخصم</span>
                                <span className="font-bold tabular-nums text-muted-foreground line-through">
                                  {o.subtotal} EGP
                                </span>
                              </div>
                              {Number(o.discount_amount ?? 0) > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 font-bold text-success">
                                    🎟️ كوبون خصم مُطبَّق
                                    {o.coupons?.code && (
                                      <code className="rounded-md bg-success/15 px-2 py-0.5 font-mono text-xs font-black">
                                        {o.coupons.code}
                                      </code>
                                    )}
                                    {o.coupons?.discount_type === "percent" && (
                                      <span className="text-[11px] text-muted-foreground">
                                        ({o.coupons.discount_value}%)
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-bold tabular-nums text-success">
                                    −{o.discount_amount} EGP
                                  </span>
                                </div>
                              )}
                              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                                <span className="font-bold">بعد الخصم</span>
                                <span className="font-black tabular-nums text-brand">
                                  {o.total} EGP
                                </span>
                              </div>
                              <dl className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[13px]">
                                <div className="flex items-center justify-between gap-2">
                                  <dt className="text-muted-foreground">الحالة</dt>
                                  <dd className="font-bold">{o.status}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <CreditCard className="size-3.5" />
                                    طريقة الدفع
                                  </dt>
                                  <dd className="font-mono font-bold">{o.payment_gateway}</dd>
                                </div>
                                {o.payment_sender_phone && (
                                  <div className="flex items-center justify-between gap-2">
                                    <dt className="text-muted-foreground">رقم المُحوَّل منه</dt>
                                    <dd className="font-mono font-bold">
                                      {o.payment_sender_phone}
                                    </dd>
                                  </div>
                                )}
                                {o.payment_reference && (
                                  <div className="flex items-center justify-between gap-2">
                                    <dt className="text-muted-foreground">مرجع الدفع</dt>
                                    <dd className="truncate font-mono font-bold">
                                      {o.payment_reference}
                                    </dd>
                                  </div>
                                )}
                                {o.notes && (
                                  <div className="flex items-start justify-between gap-2">
                                    <dt className="shrink-0 text-muted-foreground">ملاحظات</dt>
                                    <dd className="min-w-0 text-end">{o.notes}</dd>
                                  </div>
                                )}
                                {o.payment_proof_url && (
                                  <div className="pt-1">
                                    <button
                                      onClick={() => openProof(o.payment_proof_url)}
                                      className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-black text-white shadow-sm transition hover:brightness-105 active:scale-95"
                                    >
                                      عرض إثبات الدفع
                                    </button>
                                  </div>
                                )}
                              </dl>
                            </div>
                          </div>
                        </div>
                        {/* Actions rail */}
                        <aside className="min-w-0">
                          <div className="rounded-2xl border border-border/60 bg-background/50 p-3 lg:sticky lg:top-4">
                            <p className="mb-2 text-xs font-extrabold text-muted-foreground">
                              إجراءات الطلب
                            </p>
                            <div className="flex flex-col gap-2">
                              <SiteButton
                                variant="success"
                                size="sm"
                                onClick={() => updateStatus.mutate({ id: o.id, status: "paid" })}
                                disabled={o.status === "paid" || o.status === "delivered"}
                                className="w-full"
                              >
                                <Check className="size-4" />
                                تأكيد الدفع (Paid)
                              </SiteButton>
                              <SiteButton
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                  updateStatus.mutate({ id: o.id, status: "delivered" })
                                }
                                disabled={o.status === "delivered"}
                                className="w-full"
                              >
                                <Truck className="size-4" />
                                تم التسليم
                              </SiteButton>
                              <SiteButton
                                variant="danger"
                                size="sm"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: "إلغاء الطلب",
                                    message: "متأكد إنك عاوز تلغي الطلب ده؟",
                                    tone: "danger",
                                    confirmLabel: "ألغِ الطلب",
                                  });
                                  if (ok) updateStatus.mutate({ id: o.id, status: "cancelled" });
                                }}
                                disabled={o.status === "cancelled"}
                                className="w-full"
                              >
                                <X className="size-4" />
                                إلغاء
                              </SiteButton>
                              <SiteButton
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title:
                                      lang === "ar"
                                        ? "حذف الطلب نهائيًا"
                                        : "Delete order permanently",
                                    message:
                                      lang === "ar"
                                        ? "حذف الطلب نهائيًا؟ لا يمكن التراجع."
                                        : "Delete order permanently? This action cannot be undone.",
                                    tone: "danger",
                                    confirmLabel:
                                      lang === "ar" ? "احذف نهائيًا" : "Delete permanently",
                                  });
                                  if (!ok) return;

                                  // Set the order to be deleted and show password input
                                  setCurrentAction("deleteOrder");
                                  setShowPasswordInput(true);
                                  setPassword("");
                                  currentOrderToDeleteRef.current = o.id;
                                }}
                                className="w-full border-destructive/30 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                {lang === "ar" ? "حذف نهائي" : "Delete permanently"}
                              </SiteButton>
                            </div>
                          </div>
                        </aside>
                      </div>

                      {/* Items */}
                      <div className="mt-4 space-y-3 border-t border-border/60 px-4 pt-4 sm:px-5">
                        <h4 className="flex items-center gap-2 text-sm font-extrabold">
                          <span className="h-4 w-1 rounded-full bg-brand" />
                          {lang === "ar" ? "الأصناف والتسليم" : "Items & delivery"}
                        </h4>
                        {o.order_items?.map((it: any) => {
                          return (
                            <OrderItemRow
                              key={it.id}
                              item={it}
                              onDeliver={(creds) =>
                                deliver.mutateAsync({ orderItemId: it.id, creds })
                              }
                              deliverInstant={
                                it.delivery_type === "instant" && it.plan_id
                                  ? deliverInstant
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-muted-foreground text-center py-16">
            {tab === "expiring" ? "مفيش خدمات قربت تنتهي" : "No orders yet"}
          </p>
        )}
      </div>

      {proofPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <ProofLightbox
            src={proofPreview}
            loading={proofLoading || proofPreview === "__loading__"}
            onClose={() => setProofPreview(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function OrderItemRow({
  item,
  onDeliver,
  deliverInstant,
}: {
  item: any;
  onDeliver: (creds: {
    account_email: string;
    account_username: string;
    account_password: string;
    extra_notes: string;
    image_url?: string;
  }) => Promise<any>;
  deliverInstant?: {
    mutateAsync: (params: { orderItemId: string; planId: string }) => Promise<any>;
  };
}) {
  const { lang, notify } = useApp();
  const itemStatus: "pending" | "delivered" | "refunded" =
    item.status ?? (deliveredList(item.delivered_accounts).length > 0 ? "delivered" : "pending");
  const delivered = itemStatus === "delivered";
  const deliveredAccounts: any[] = deliveredList(item.delivered_accounts);
  const firstDelivered = deliveredAccounts[0];

  const extractImgFromNotes = (notes?: string) => {
    if (!notes) return "";
    const m = notes.match(/\[image\]:\s*(https?:\/\/[^\s]+)/i);
    return m ? m[1] : "";
  };

  const cleanNotesStr = (notes?: string) => {
    if (!notes) return "";
    return notes.replace(/\[image\]:\s*https?:\/\/[^\s]+/gi, "").trim();
  };

  const [isEditing, setIsEditing] = useState(false);
  const [creds, setCreds] = useState({
    account_email: firstDelivered?.account_email || "",
    account_username: firstDelivered?.account_username || "",
    account_password: firstDelivered?.account_password || "",
    extra_notes: cleanNotesStr(firstDelivered?.extra_notes),
    image_url: extractImgFromNotes(firstDelivered?.extra_notes),
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliverInstantBusy, setDeliverInstantBusy] = useState(false);
  const [deliverBusy, setDeliverBusy] = useState(false);

  const handleFileUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `proofs/${crypto.randomUUID()}.${ext}`;
      let bucket = "payment-proofs";
      let { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000, public, immutable",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) {
        bucket = "testimonial-images";
        const fb = await supabase.storage.from(bucket).upload(path, file, {
          cacheControl: "31536000, public, immutable",
          upsert: false,
          contentType: file.type,
        });
        if (fb.error) throw fb.error;
      }
      const { data: signedData } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      const finalUrl = signedData?.signedUrl || publicUrl;
      setCreds((prev) => ({ ...prev, image_url: finalUrl }));
      notify(lang === "ar" ? "تم رفع الصورة " : "Image uploaded successfully", "success");
    } catch (e: any) {
      notify(e?.message || (lang === "ar" ? "فشل رفع الصورة" : "Upload failed"), "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const refunded = itemStatus === "refunded";

  const resend = async () => {
    setResending(true);
    try {
      await notifyItemDelivered({ data: { orderItemId: item.id } });
      notify(lang === "ar" ? "تم إعادة إرسال الإيميل" : "Email resent", "success");
    } catch (e: any) {
      notify(e?.message || (lang === "ar" ? "فشل الإرسال" : "Send failed"), "error");
    } finally {
      setResending(false);
    }
  };

  const plan = item.product_plans;
  const prod = item.products;
  const lineTotal = Number(item.frozen_unit_price ?? item.unit_price) * Number(item.quantity);
  const originalUnit = plan?.price ? Number(plan.price) : null;
  const discounted =
    originalUnit !== null &&
    Math.abs(originalUnit - Number(item.frozen_unit_price ?? item.unit_price)) > 0.5;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex justify-between mb-2 gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {(prod?.cover_url || prod?.icon_url) && (
            <img
              src={prod.cover_url || prod.icon_url}
              alt=""
              className="w-12 h-12 rounded-2xl object-cover border border-border/60 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap" dir={lang === "ar" ? "rtl" : "ltr"}>
              {prod?.slug ? (
                <a
                  href={`/product/${prod.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold hover:text-brand underline-offset-2 hover:underline"
                >
                  <bdi>{item.product_name}</bdi>
                </a>
              ) : (
                <span className="font-bold">
                  <bdi>{item.product_name}</bdi>
                </span>
              )}
              <span className="text-sm font-bold text-muted-foreground">
                {lang === "ar" ? "الكمية:" : "Qty:"} {item.quantity}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5" dir={lang === "ar" ? "rtl" : "ltr"}>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-bold">
                {lang === "ar" ? "الخطة:" : "Plan:"} <bdi>{item.plan_label}</bdi>
              </span>
              {item.account_type && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-bold">
                  {lang === "ar" ? "نوع الحساب:" : "Account:"}{" "}
                  {item.account_type === "private"
                    ? lang === "ar"
                      ? "خاص"
                      : "Private"
                    : item.account_type === "shared"
                      ? lang === "ar"
                        ? "مشترك"
                        : "Shared"
                      : item.account_type}
                </span>
              )}
              {plan?.plan_variant && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 font-bold">
                  {lang === "ar" ? "نوع الخطة:" : "Variant:"} <bdi>{plan.plan_variant}</bdi>
                </span>
              )}
              {plan?.duration_days > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold">
                  {lang === "ar" ? "المدة:" : "Duration:"}{" "}
                  {lang === "ar" ? `${plan.duration_days} يوم` : `${plan.duration_days} days`}
                </span>
              )}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.delivery_type === "instant" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
              >
                {lang === "ar" ? "التسليم:" : "Delivery:"}{" "}
                {item.delivery_type === "instant"
                  ? lang === "ar"
                    ? "فوري"
                    : "Instant"
                  : lang === "ar"
                    ? "يدوي"
                    : "Manual"}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${delivered ? "bg-success/15 text-success" : refunded ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}
              >
                {delivered
                  ? lang === "ar"
                    ? "✓ تم التسليم"
                    : "✓ Delivered"
                  : refunded
                    ? lang === "ar"
                      ? "↺ تم الاسترداد"
                      : "↺ Refunded"
                    : lang === "ar"
                      ? "⏳ قيد المراجعة"
                      : "⏳ Pending review"}
              </span>
            </div>
          </div>
        </div>
        <div className="text-sm shrink-0 text-end" dir="ltr">
          <div className="text-xs text-muted-foreground">
            {item.frozen_unit_price ?? item.unit_price} EGP
            {discounted && originalUnit !== null && (
              <span className="ms-1 line-through opacity-60">{originalUnit} EGP</span>
            )}
          </div>
          <div className="font-extrabold text-brand text-base">{lineTotal} EGP</div>
        </div>
      </div>

      {item.subscription_email && (
        <div className="mb-2 flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.06] px-3 py-1.5 text-xs">
          <span className="shrink-0 font-bold text-brand">
            {lang === "ar" ? "التفعيل على:" : "Activate on:"}
          </span>{" "}
          <span className="min-w-0 flex-1 truncate font-mono font-bold" dir="ltr">
            {item.subscription_email}
          </span>
        </div>
      )}

      {delivered && !isEditing ? (
        <div className="mt-2 rounded-2xl border border-success/25 bg-success/[0.04] p-3.5 font-mono text-xs">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="font-sans font-extrabold text-success">
              {deliveredAccounts.length > 0
                ? lang === "ar"
                  ? "بيانات الحساب المُسلَّم"
                  : "Delivered account details"
                : lang === "ar"
                  ? "لا توجد بيانات حساب مسجّلة لهذا العنصر"
                  : "No account details recorded for this item"}
            </span>

            <div className="flex items-center gap-1.5">
              <SiteButton
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="border-warning/40 py-1.5 text-[11px] text-warning hover:border-warning/60 hover:bg-warning/10 hover:text-warning"
              >
                ✏️ {lang === "ar" ? "تعديل البيانات والإيميل" : "Edit details & email"}
              </SiteButton>

              <SiteButton
                variant="outline"
                size="sm"
                onClick={resend}
                disabled={resending}
                className="py-1.5 text-[11px]"
              >
                {resending
                  ? lang === "ar"
                    ? "جاري..."
                    : "Sending..."
                  : lang === "ar"
                    ? "إعادة إرسال الإيميل"
                    : "Resend email"}
              </SiteButton>
            </div>
          </div>
          {deliveredAccounts.map((a: any) => {
            const dur = Number(item.product_plans?.duration_days ?? 0);
            const startAt = a.delivered_at ? new Date(a.delivered_at) : null;
            const endAt = startAt && dur > 0 ? new Date(startAt.getTime() + dur * 86400_000) : null;
            const fmt = (d: Date) =>
              d.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { hour12: true });
            const daysLeft = endAt ? Math.ceil((endAt.getTime() - Date.now()) / 86400_000) : null;
            const imgUrl = extractImgFromNotes(a.extra_notes);
            const notesClean = cleanNotesStr(a.extra_notes);

            return (
              <div key={a.id} className="mt-1 space-y-1">
                {a.account_email && <div>Email: {a.account_email}</div>}
                {a.account_username && <div>User: {a.account_username}</div>}
                {a.account_password && <div>Pass: {a.account_password}</div>}
                {notesClean && <div className="whitespace-pre-wrap">Notes: {notesClean}</div>}
                {imgUrl && (
                  <div className="mt-2 pt-2 border-t border-success/20">
                    <span className="font-sans font-bold text-muted-foreground block mb-1">
                      {lang === "ar" ? " الصورة المرفقة:" : "Attached Image:"}
                    </span>
                    <a
                      href={imgUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block max-w-xs rounded overflow-hidden border border-border"
                    >
                      <img src={imgUrl} alt="Attached Proof" className="max-h-36 object-contain" />
                    </a>
                  </div>
                )}

                {startAt && (
                  <div className="mt-2 pt-2 border-t border-success/20 grid grid-cols-1 sm:grid-cols-2 gap-1 font-sans">
                    <div>
                      <span className="text-muted-foreground">
                        {lang === "ar" ? "تاريخ الاشتراك:" : "Subscribed:"}
                      </span>{" "}
                      <span className="font-bold">{fmt(startAt)}</span>
                    </div>
                    {endAt ? (
                      <div>
                        <span className="text-muted-foreground">
                          {lang === "ar" ? "تاريخ الانتهاء:" : "Expires:"}
                        </span>{" "}
                        <span
                          className={`font-bold ${daysLeft !== null && daysLeft < 0 ? "text-destructive" : daysLeft !== null && daysLeft <= 7 ? "text-destructive" : daysLeft !== null && daysLeft <= 30 ? "text-warning" : ""}`}
                        >
                          {fmt(endAt)}
                          {daysLeft !== null && (
                            <span className="ms-1 text-[10px]">
                              (
                              {daysLeft < 0
                                ? lang === "ar"
                                  ? `انتهت من ${Math.abs(daysLeft)} يوم`
                                  : `expired ${Math.abs(daysLeft)}d ago`
                                : lang === "ar"
                                  ? `باقي ${daysLeft} يوم`
                                  : `${daysLeft}d left`}
                              )
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">
                        {lang === "ar" ? "المدة: غير محددة" : "Duration: N/A"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-2.5">
            {(() => {
              const emailValue = creds.account_email.trim();
              const emailOk =
                emailValue.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
              const hasAny =
                emailValue.length > 0 ||
                creds.account_username.trim().length > 0 ||
                creds.account_password.trim().length > 0 ||
                creds.extra_notes.trim().length > 0 ||
                creds.image_url.trim().length > 0;
              const canDeliver = emailOk && hasAny;
              const box = (ok: boolean) =>
                `px-3 py-2.5 bg-card border rounded-2xl text-sm outline-none transition focus:ring-2 focus:ring-brand/20 ${ok ? "border-border/60 focus:border-brand" : "border-destructive/50"}`;
              return (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!canDeliver || deliverBusy) return;
                    setDeliverBusy(true);
                    onDeliver(creds)
                      .then(() => {
                        setIsEditing(false);
                      })
                      .finally(() => setDeliverBusy(false));
                  }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl border border-border/60 bg-background/50 p-3.5"
                >
                  {deliverInstant && !delivered && (
                    <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground sm:col-span-2">
                      <span className="h-3.5 w-1 rounded-full bg-brand" />
                      {lang === "ar" ? "التسليم اليدوي" : "Manual delivery"}
                    </p>
                  )}
                  <input
                    type="email"
                    placeholder={
                      lang === "ar" ? "Account email (اختياري)" : "Account email (optional)"
                    }
                    value={creds.account_email}
                    onChange={(e) => setCreds({ ...creds, account_email: e.target.value })}
                    className={box(emailOk)}
                  />
                  <input
                    placeholder={lang === "ar" ? "Username (اختياري)" : "Username (optional)"}
                    value={creds.account_username}
                    onChange={(e) => setCreds({ ...creds, account_username: e.target.value })}
                    className={box(true)}
                  />
                  <input
                    placeholder={lang === "ar" ? "Password (اختياري)" : "Password (optional)"}
                    value={creds.account_password}
                    onChange={(e) => setCreds({ ...creds, account_password: e.target.value })}
                    className={box(true)}
                  />
                  <input
                    placeholder={lang === "ar" ? "Notes / ملاحظات (اختياري)" : "Notes (optional)"}
                    value={creds.extra_notes}
                    onChange={(e) => setCreds({ ...creds, extra_notes: e.target.value })}
                    className="px-3 py-2.5 bg-card border border-border/60 rounded-2xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                  <div className="sm:col-span-2 rounded-2xl border border-border/60 bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        {lang === "ar" ? "صورة (اختياري)" : "Proof Image Attachment (optional)"}
                      </span>
                      {creds.image_url && (
                        <button
                          type="button"
                          onClick={() => setCreds({ ...creds, image_url: "" })}
                          className="text-[11px] font-bold text-destructive hover:underline"
                        >
                          {lang === "ar" ? "إزالة الصورة 🗑️" : "Remove image 🗑️"}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <SiteButton variant="dashed" size="sm" asChild className="w-full sm:w-auto">
                        <label className="cursor-pointer">
                          <span className="flex items-center justify-center gap-2">
                            {uploadingImage ? (
                              <>
                                <span className="animate-spin">⏳</span>
                                {lang === "ar" ? "جاري رفع الصورة..." : "Uploading image..."}
                              </>
                            ) : (
                              <>{lang === "ar" ? "رفع صورة من الجهاز" : "Upload image file"}</>
                            )}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingImage}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </SiteButton>

                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {lang === "ar" ? "أو" : "or"}
                      </span>

                      <input
                        type="url"
                        placeholder={
                          lang === "ar" ? "أدخل رابط صورة مباشر..." : "Or paste image URL..."
                        }
                        value={creds.image_url}
                        onChange={(e) => setCreds({ ...creds, image_url: e.target.value })}
                        className="flex-1 w-full px-3 py-2 bg-background border border-border/60 rounded-2xl text-xs outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </div>

                    {creds.image_url && (
                      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-2">
                        <img
                          src={creds.image_url}
                          alt="Attached Preview"
                          className="h-14 max-w-28 object-contain rounded border border-border bg-black/20"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-success block">
                            ✓ {lang === "ar" ? "تم إرفاق الصورة" : "Image attached"}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate block font-mono">
                            {creds.image_url}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {!canDeliver && (
                    <p className="sm:col-span-2 text-[11px] text-warning">
                      {!emailOk
                        ? lang === "ar"
                          ? "صيغة الإيميل غير صحيحة."
                          : "Invalid email format."
                        : lang === "ar"
                          ? "املأ خانة واحدة على الأقل قبل التسليم/التحديث."
                          : "Fill at least one field before saving."}
                    </p>
                  )}
                  <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                    {deliverInstant && !delivered && (
                      <SiteButton
                        variant="success"
                        onClick={async () => {
                          setDeliverInstantBusy(true);
                          try {
                            await deliverInstant.mutateAsync({
                              orderItemId: item.id,
                              planId: item.plan_id,
                            });
                          } finally {
                            setDeliverInstantBusy(false);
                          }
                        }}
                        disabled={deliverInstantBusy}
                        className="py-2.5"
                      >
                        {deliverInstantBusy ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            {lang === "ar" ? " جاري التسليم..." : " Delivering..."}
                          </>
                        ) : lang === "ar" ? (
                          "⚡ تسليم فوري من المخزون"
                        ) : (
                          "⚡ Deliver from inventory"
                        )}
                      </SiteButton>
                    )}
                    <SiteButton
                      variant="primary"
                      type="submit"
                      disabled={!canDeliver || deliverBusy}
                      className={`py-2.5 ${deliverInstant && !delivered ? "" : "sm:col-span-2"}`}
                    >
                      {deliverBusy
                        ? lang === "ar"
                          ? "جاري الحفظ والتسليم..."
                          : "Saving & Delivering..."
                        : isEditing || delivered
                          ? lang === "ar"
                            ? "✓ حفظ البيانات المعدلة وإرسال الإيميل"
                            : "✓ Save updated details & email"
                          : lang === "ar"
                            ? "تسليم يدوي وإرسال إيميل"
                            : "Deliver manually & email"}
                    </SiteButton>
                  </div>
                  {isEditing && (
                    <div className="sm:col-span-2">
                      <SiteButton
                        variant="ghost"
                        onClick={() => setIsEditing(false)}
                        className="w-full"
                      >
                        {lang === "ar" ? "إلغاء" : "Cancel"}
                      </SiteButton>
                    </div>
                  )}
                </form>
              );
            })()}
          </div>
          <aside className="min-w-0">
            <div className="rounded-2xl border border-brand/20 bg-gradient-to-b from-brand/[0.07] to-transparent p-3.5 lg:sticky lg:top-3">
              <p className="mb-2 text-xs font-extrabold text-muted-foreground">ملخص الصنف</p>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">سعر الوحدة</span>
                  <b className="tabular-nums">
                    {Number(item.frozen_unit_price ?? item.unit_price)} EGP
                  </b>
                </div>
                {discounted && originalUnit !== null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">قبل الخصم</span>
                    <span className="tabular-nums text-muted-foreground line-through">
                      {originalUnit} EGP
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{lang === "ar" ? "الكمية" : "Qty"}</span>
                  <b className="tabular-nums">× {item.quantity}</b>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-sm font-black tabular-nums">
                  <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
                  <span className="text-brand-deep">{lineTotal} EGP</span>
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${delivered ? "border-success/30 bg-success/10 text-success" : refunded ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-warning"}`}
                  >
                    {delivered
                      ? lang === "ar"
                        ? "✓ تم التسليم"
                        : "✓ Delivered"
                      : refunded
                        ? lang === "ar"
                          ? "↺ تم الاسترداد"
                          : "↺ Refunded"
                        : lang === "ar"
                          ? "⏳ قيد المراجعة"
                          : "⏳ Pending review"}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ProofLightbox({
  src,
  loading,
  onClose,
}: {
  src: string;
  loading: boolean;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const clampZoom = (z: number) => Math.max(1, Math.min(5, z));
  const setZ = (z: number) => {
    const nz = clampZoom(z);
    setZoom(nz);
    if (nz === 1) setPos({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZ(zoom + (e.deltaY < 0 ? 0.2 : -0.2));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const nd = Math.hypot(dx, dy);
      setZ(pinchRef.current.zoom * (nd / pinchRef.current.dist));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10080] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute top-4 end-4 grid place-items-center size-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none z-20"
      >
        ×
      </button>
      <div className="absolute top-4 start-4 flex gap-2 z-20" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setZ(zoom - 0.3)}
          className="size-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl font-bold"
        >
          −
        </button>
        <button
          onClick={() => setZ(1)}
          className="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZ(zoom + 0.3)}
          className="size-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl font-bold"
        >
          +
        </button>
      </div>
      <div
        className="relative flex items-center justify-center overflow-hidden select-none"
        style={{
          width: "min(90vw, 520px)",
          height: "min(80vh, 640px)",
          cursor: zoom > 1 ? "grab" : "zoom-in",
          touchAction: "none",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (zoom === 1) setZ(2);
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {loading ? (
          <div className="text-white text-center py-20">جارٍ التحميل...</div>
        ) : (
          <img
            src={src}
            alt="إثبات الدفع"
            draggable={false}
            className="max-w-full max-h-full object-contain rounded-xl transition-transform"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})` }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
