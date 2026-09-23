import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Package,
  ShoppingCart,
  Clock,
  Mail,
  Phone,
  KeyRound,
  Activity,
  Trash2,
  Radio,
  ScrollText,
} from "lucide-react";
import { AdminHero, HeroAction, HeroGlass } from "@/components/AdminHero";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAuditLog, clearAuditLogServer, type AuditRowEnriched } from "@/lib/audit.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  beforeLoad: async ({ context }) => {
    const user = (context as { user?: { id: string } } | undefined)?.user;
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    // Only admin can access the audit log
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/admin" });
  },
  component: AdminAudit,
});

const ACTION_LABELS: Record<string, string> = {
  "order.created": "طلب جديد",
  "order.status_change": "تغيير حالة طلب",
  "order_item.delivered": "تسليم خدمة",
  "order_item.refunded": "استرداد خدمة",
  "order_item.status_change": "تغيير حالة خدمة",
  "delivery.manual": "تسليم يدوي",
  "refund.created": "إنشاء تعويض",
  "refund.updated": "تعديل تعويض",
  "refund.deleted": "حذف تعويض",
  "product.created": "إضافة منتج",
  "product.updated": "تعديل منتج",
  "product.deleted": "حذف منتج",
  "plan.created": "إضافة خطة",
  "plan.updated": "تعديل خطة",
  "plan.deleted": "حذف خطة",
  "plan_cost.updated": "تعديل تكلفة خطة",
  "plan_cost.deleted": "حذف تكلفة خطة",
  "category.created": "إضافة قسم",
  "category.updated": "تعديل قسم",
  "category.deleted": "حذف قسم",
  "faq.created": "إضافة سؤال شائع",
  "faq.updated": "تعديل سؤال شائع",
  "faq.deleted": "حذف سؤال شائع",
  "review.created": "إضافة تقييم",
  "review.updated": "تعديل تقييم",
  "review.deleted": "حذف تقييم",
  "testimonial.created": "إضافة صورة توصية",
  "testimonial.updated": "تعديل صورة توصية",
  "testimonial.deleted": "حذف صورة توصية",
  "role.granted": "منح صلاحية",
  "role.revoked": "سحب صلاحية",
  "setting.updated": "تعديل إعداد",
  "setting.deleted": "حذف إعداد",
  "coupon.created": "إنشاء كوبون",
  "coupon.updated": "تعديل كوبون",
  "coupon.deleted": "حذف كوبون",
  "coupon.redeemed": "استخدام كوبون",
};

const FIELD_LABELS: Record<string, string> = {
  name_ar: "الاسم بالعربية",
  name_en: "الاسم بالإنجليزية",
  slug: "الرابط (Slug)",
  description_ar: "الوصف بالعربية",
  description_en: "الوصف بالإنجليزية",
  icon_url: "أيقونة",
  cover_url: "صورة الغلاف",
  status: "الحالة",
  is_featured: "مميز",
  is_bestseller: "الأكثر مبيعاً",
  sort_order: "الترتيب",
  discount_percent: "نسبة الخصم",
  account_type: "نوع الحساب",
  account_types: "أنواع الحساب",
  category_id: "القسم",
  category_ids: "الأقسام",
  plan_variants: "أنواع الخطط",
  delivery_type: "نوع التسليم",
  google_spreadsheet_id: "معرّف Google Sheet",
  label_ar: "التسمية بالعربية",
  label_en: "التسمية بالإنجليزية",
  duration_days: "المدة (يوم)",
  price: "السعر",
  compare_price: "السعر قبل الخصم",
  stock: "المخزون",
  is_active: "نشط",
  plan_variant: "نوع الخطة",
  sheet_csv_url: "رابط CSV",
  cost_price: "التكلفة",
  question_ar: "السؤال بالعربية",
  question_en: "السؤال بالإنجليزية",
  answer_ar: "الإجابة بالعربية",
  answer_en: "الإجابة بالإنجليزية",
  reviewer_name: "اسم المُقيّم",
  rating: "التقييم",
  body: "النص",
  lang: "اللغة",
  image_url: "الصورة",
  caption: "التعليق",
  value: "القيمة",
  key: "المفتاح",
  amount: "المبلغ",
  notes: "ملاحظات",
  type: "النوع",
  code: "الكود",
  discount_type: "نوع الخصم",
  discount_value: "قيمة الخصم",
  applies_to: "يطبّق على",
  max_uses: "أقصى استخدام",
  used_count: "عدد الاستخدامات",
  expires_at: "ينتهي في",
  min_order_amount: "أدنى قيمة للطلب",
  product_ids: "المنتجات المحددة",
};

const TARGET_LABELS: Record<string, string> = {
  order: "طلب",
  order_item: "خدمة داخل طلب",
  refund: "تعويض",
  product: "منتج",
  plan: "خطة",
  category: "قسم",
  faq: "سؤال شائع",
  review: "تقييم",
  testimonial: "توصية",
  user_role: "صلاحية",
  setting: "إعداد",
  coupon: "كوبون خصم",
};

const STATUS_TONES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  paid: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  delivered: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  refunded: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function actionTone(action: string) {
  // Refunds/compensations always red -they're money going out.
  if (action.startsWith("refund.") || action.includes("refunded"))
    return "bg-destructive/10 text-destructive border-destructive/20";
  if (action.includes("deleted") || action.includes("revoked"))
    return "bg-destructive/10 text-destructive border-destructive/20";
  if (action.includes("delivered") || action.includes("created") || action.includes("granted"))
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (action.includes("updated") || action.includes("status_change") || action.includes("manual"))
    return "bg-brand/10 text-brand border-brand/20";
  return "bg-muted text-muted-foreground border-border";
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString("ar-EG", { hour12: true });
}

/** Resolve the order_id a row belongs to, if any. */
function orderKey(r: AuditRowEnriched): string | null {
  const meta = (r.meta ?? {}) as any;
  if (r.order_id) return r.order_id;
  if (r.target_type === "order" && r.target_id) return r.target_id;
  if (meta.order_id) return String(meta.order_id);
  if (r.order_number) return `on:${r.order_number}`;
  return null;
}

type Group = {
  key: string;
  order: AuditRowEnriched | null; // canonical row carrying order+items snapshot
  events: AuditRowEnriched[]; // all events, newest first
  latestAt: string;
};

function AdminAudit() {
  const fetchAudit = useServerFn(getAuditLog);
  const clearAuditFn = useServerFn(clearAuditLogServer);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [clearing, setClearing] = useState(false);

  const rows = useQuery({
    queryKey: ["audit-log-enriched"],
    queryFn: () => fetchAudit({ data: { limit: 1000 } }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  // Realtime -refetch on any change in audit_log.
  useEffect(() => {
    const channelName = `audit-log-live-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, () => {
        qc.invalidateQueries({ queryKey: ["audit-log-enriched"] });
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const clearAll = async () => {
    if (!window.confirm("سيتم مسح كل حركات سجل الأعمال نهائياً. متأكد؟")) return;
    setClearing(true);
    try {
      await clearAuditFn();
      toast.success("تم مسح كل سجل الأعمال");
      qc.invalidateQueries({ queryKey: ["audit-log-enriched"] });
    } catch (e: any) {
      toast.error("تعذّر مسح السجل: " + (e.message || "خطأ غير معروف"));
    } finally {
      setClearing(false);
    }
  };

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    (rows.data ?? []).forEach((r) => set.add(r.action_type));
    return Array.from(set).sort();
  }, [rows.data]);

  /** Group events by order; non-order rows become singleton groups.
   *  Groups are sorted by the newest event inside them, so any recent change
   *  bubbles the whole order card to the top. */
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    const singles: Group[] = [];
    for (const r of rows.data ?? []) {
      const key = orderKey(r);
      if (!key) {
        singles.push({ key: `ev:${r.id}`, order: null, events: [r], latestAt: r.created_at });
        continue;
      }
      const g = map.get(key);
      if (g) {
        g.events.push(r);
        if (Date.parse(r.created_at) > Date.parse(g.latestAt)) g.latestAt = r.created_at;
        // Prefer the row with the richest order snapshot as canonical
        if (!g.order || (r.order_number && (!g.order.order_number || r.items.length > g.order.items.length))) {
          g.order = r;
        }
      } else {
        map.set(key, {
          key,
          order: r.order_number || r.items.length ? r : null,
          events: [r],
          latestAt: r.created_at,
        });
      }
    }
    const all = [...Array.from(map.values()), ...singles];
    // Newest activity first across groups
    all.sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
    // Newest event first inside each group
    all.forEach((g) => g.events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
    return all;
  }, [rows.data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (target && !g.events.some((r) => r.target_type === target)) return false;
      if (action && !g.events.some((r) => r.action_type === action)) return false;
      if (!s) return true;
      const canon = g.order ?? g.events[0];
      const hay = [
        canon.order_number,
        canon.order_customer_name,
        canon.order_customer_email,
        canon.order_customer_phone,
        canon.order_status,
        ...canon.items.flatMap((it) => [
          it.product_name,
          it.plan_label,
          it.account_type,
          it.status,
          ...(Array.isArray(it.delivered_accounts) ? it.delivered_accounts : []).flatMap((a) => [
            a.account_email,
            a.account_username,
          ]),
        ]),
        ...g.events.flatMap((r) => [
          r.actor_display,
          r.actor_email,
          r.actor_name,
          r.action_type,
          ACTION_LABELS[r.action_type],
          r.target_type,
          r.target_id,
          JSON.stringify(r.meta ?? {}),
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [groups, q, target, action]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportXlsx = () => {
    const list: any[] = [];
    filtered.forEach((g) => {
      const canon = g.order ?? g.events[0];
      g.events.forEach((r) => {
        list.push({
          "رقم الطلب": canon.order_number ?? "",
          "حالة الطلب": canon.order_status ?? "",
          "إجمالي الطلب": canon.order_total ?? "",
          "اسم العميل": canon.order_customer_name ?? "",
          "إيميل العميل": canon.order_customer_email ?? "",
          "هاتف العميل": canon.order_customer_phone ?? "",
          التاريخ: fmtTime(r.created_at),
          الحركة: ACTION_LABELS[r.action_type] || r.action_type,
          "نوع الهدف": TARGET_LABELS[r.target_type] || r.target_type,
          المستخدم: r.actor_display,
          "بريد المستخدم": r.actor_email ?? "",
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(list);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `audit-log-${stamp}.xlsx`);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <AdminHero
        icon={ScrollText}
        title="سجل الأعمال"
        subtitle="كل عملية في خانة واحدة - أي تغيير يظهر تلقائياً بدون تحديث الصفحة"
        badge={
          <>
            <Radio className={`w-3 h-3 ${live ? "animate-pulse" : ""}`} />
            {live ? "مباشر" : "غير متصل"}
          </>
        }
        actions={
          <>
            <HeroAction onClick={exportXlsx} disabled={filtered.length === 0}>
              <Download className="w-4 h-4" /> تحميل Excel
            </HeroAction>
            <HeroGlass>
              <button onClick={() => rows.refetch()} className="inline-flex items-center gap-1.5">
                <RefreshCw className={`w-4 h-4 ${rows.isFetching ? "animate-spin" : ""}`} /> تحديث
              </button>
            </HeroGlass>
            <HeroGlass>
              <button
                onClick={clearAll}
                disabled={clearing || (rows.data?.length ?? 0) === 0}
                className="inline-flex items-center gap-1.5 text-red-100 hover:text-white disabled:opacity-50"
              >
                <Trash2 className={`w-4 h-4 ${clearing ? "animate-pulse" : ""}`} />
                {clearing ? "جارٍ المسح..." : "مسح كل السجل"}
              </button>
            </HeroGlass>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="طلبات في السجل" value={filtered.filter((g) => g.order).length} tone="text-brand" />
        <Kpi label="إجمالي الحركات" value={filtered.reduce((n, g) => n + g.events.length, 0)} />
        <Kpi
          label="تسليم خدمات"
          value={(rows.data ?? []).filter((r) => r.action_type === "order_item.delivered").length}
          tone="text-emerald-500"
        />
        <Kpi
          label="تغيير حالة"
          value={(rows.data ?? []).filter((r) => r.action_type.includes("status_change")).length}
          tone="text-amber-500"
        />
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-[1fr_200px_200px] gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث برقم الطلب، الإيميل، الهاتف، المنتج، المستخدم، أو أي كلمة..."
            className="w-full ps-3 pe-9 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-muted-foreground" />
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full ps-3 pe-9 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-brand appearance-none"
          >
            <option value="">كل الأنواع</option>
            {Object.entries(TARGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-muted-foreground" />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full ps-3 pe-9 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-brand appearance-none"
          >
            <option value="">كل الحركات</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {rows.isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
            جاري التحميل...
          </div>
        )}
        {rows.isError && (
          <div className="p-8 text-center text-sm text-destructive bg-card border border-destructive/30 rounded-2xl space-y-3">
            <p className="font-bold">تعذّر تحميل سجل الأعمال: {(rows.error as Error)?.message || "خطأ في السيرفر"}</p>
            <button
              onClick={() => rows.refetch()}
              className="px-4 py-2 bg-brand text-brand-foreground rounded-xl text-xs font-bold"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {!rows.isLoading && !rows.isError && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
            لا توجد نتائج مطابقة أو أن السجل فارغ حالياً.
          </div>
        )}
        {!rows.isError && filtered.map((g) => (
          <GroupCard key={g.key} group={g} expanded={expanded.has(g.key)} onToggle={() => toggle(g.key)} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl sm:text-2xl font-extrabold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function GroupCard({ group, expanded, onToggle }: { group: Group; expanded: boolean; onToggle: () => void }) {
  const canon = group.order ?? group.events[0];
  const isOrder = !!canon.order_number || canon.items.length > 0;
  const HIDDEN_ACTIONS = new Set(["order.created", "coupon.redeemed"]);
  const visibleEvents = isOrder ? group.events.filter((r) => !HIDDEN_ACTIONS.has(r.action_type)) : group.events;

  // Any refund/compensation events on this order?
  const refundEvents = group.events.filter((r) => r.action_type.startsWith("refund."));
  const hasRefund = refundEvents.length > 0;
  const refundTotal = refundEvents.reduce((sum, r) => {
    const amt = Number((r.meta as any)?.amount ?? 0);
    return r.action_type === "refund.created" ? sum + (Number.isFinite(amt) ? amt : 0) : sum;
  }, 0);

  return (
    <div
      className={`bg-card border rounded-2xl overflow-hidden ${hasRefund ? "border-destructive/40 ring-1 ring-destructive/20" : "border-border"
        }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-start p-3 sm:p-4 flex flex-wrap items-center gap-3 hover:bg-muted/40 transition"
      >
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rtl:rotate-180" />}
        </div>

        {isOrder ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-brand">
              <ShoppingCart className="w-4 h-4" />
              {canon.order_number ?? "-"}
            </span>
            {hasRefund && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-destructive/40 bg-destructive/10 text-destructive text-[10px] font-extrabold">
                <span>↩</span>
                تعويض
                {refundTotal > 0 && <span className="tabular-nums">− {refundTotal} EGP</span>}
              </span>
            )}
            {canon.order_status && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_TONES[canon.order_status] ?? "bg-muted text-muted-foreground border-border"
                  }`}
              >
                {canon.order_status}
              </span>
            )}
            {canon.order_customer_name && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <UserIcon className="w-3 h-3" />
                <bdi>{canon.order_customer_name}</bdi>
              </span>
            )}
            {canon.order_total != null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground tabular-nums">
                {canon.order_total} EGP
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="w-3 h-3" /> {visibleEvents.length} حركة
            </span>
          </>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${actionTone(
                canon.action_type,
              )}`}
            >
              {ACTION_LABELS[canon.action_type] || canon.action_type}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Package className="w-3 h-3" /> {TARGET_LABELS[canon.target_type] || canon.target_type}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserIcon className="w-3 h-3" />
              <bdi>{canon.actor_display}</bdi>
            </span>
          </>
        )}

        <span
          className="ms-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
          dir="ltr"
        >
          <Clock className="w-3 h-3" />
          {fmtTime(group.latestAt)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 sm:p-4 space-y-3 bg-background/40">
          {/* Order details */}
          {isOrder && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ShoppingCart className="w-3.5 h-3.5 text-brand" />
                تفاصيل الطلب
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {canon.order_customer_name && (
                  <InfoChip icon={<UserIcon className="w-3 h-3" />} label="العميل" value={canon.order_customer_name} />
                )}
                {canon.order_customer_email && (
                  <InfoChip icon={<Mail className="w-3 h-3" />} label="الإيميل" value={canon.order_customer_email} />
                )}
                {canon.order_customer_phone && (
                  <InfoChip icon={<Phone className="w-3 h-3" />} label="الهاتف" value={canon.order_customer_phone} />
                )}
                {canon.order_total != null && <InfoChip label="الإجمالي" value={`${canon.order_total} EGP`} />}
                {canon.order_status && <InfoChip label="الحالة" value={canon.order_status} />}
              </div>

              {(canon.order_coupon_code ||
                (canon.order_discount_amount != null && canon.order_discount_amount > 0)) && (
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand">
                      <span>🎟️</span> كوبون خصم مُستخدم
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      {canon.order_coupon_code && <InfoChip label="الكود" value={canon.order_coupon_code} mono />}
                      {canon.order_subtotal != null && (
                        <InfoChip label="قبل الخصم" value={`${canon.order_subtotal} EGP`} />
                      )}
                      {canon.order_discount_amount != null && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-muted-foreground">الخصم:</span>
                          <bdi className="font-bold text-success">− {canon.order_discount_amount} EGP</bdi>
                        </span>
                      )}
                      {canon.order_total != null && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-muted-foreground">بعد الخصم:</span>
                          <bdi className="font-bold text-emerald-600">{canon.order_total} EGP</bdi>
                        </span>
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Items + delivered accounts */}
          {isOrder && canon.items.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Package className="w-3.5 h-3.5 text-brand" />
                الخدمات ({canon.items.length})
              </div>
              <div className="grid gap-2">
                {canon.items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-border/70 bg-background/50 p-2.5 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-bold text-sm">
                        <bdi>{it.product_name ?? "-"}</bdi>
                      </span>
                      {it.plan_label && (
                        <span className="px-1.5 py-0.5 rounded-md border border-border text-[10px]">
                          <bdi>{it.plan_label}</bdi>
                        </span>
                      )}
                      {it.account_type && (
                        <span className="px-1.5 py-0.5 rounded-md border border-border text-[10px]">
                          <bdi>{it.account_type}</bdi>
                        </span>
                      )}
                      {it.status && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_TONES[it.status] ?? "bg-muted text-muted-foreground border-border"
                            }`}
                        >
                          {it.status}
                        </span>
                      )}
                      {it.unit_price != null && (
                        <span className="ms-auto text-[11px] font-bold tabular-nums">
                          {it.frozen_unit_price ?? it.unit_price} EGP
                          {it.quantity && it.quantity > 1 ? ` × ${it.quantity}` : ""}
                        </span>
                      )}
                    </div>
                    {(Array.isArray(it.delivered_accounts) ? it.delivered_accounts : []).length > 0 && (
                      <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2 space-y-1.5">
                        <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <KeyRound className="w-3 h-3" />
                          بيانات مُسلَّمة ({(Array.isArray(it.delivered_accounts) ? it.delivered_accounts : []).length})
                        </div>
                        {(Array.isArray(it.delivered_accounts) ? it.delivered_accounts : []).map((a, i) => (
                          <div key={i} className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                            {a.account_email && (
                              <InfoChip
                                icon={<Mail className="w-3 h-3" />}
                                label="إيميل"
                                value={a.account_email}
                                mono
                              />
                            )}
                            {a.account_username && <InfoChip label="يوزر" value={a.account_username} mono />}
                            {a.account_password && <InfoChip label="باسورد" value={a.account_password} mono />}
                            {a.extra_notes && <InfoChip label="ملاحظات" value={a.extra_notes} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Activity className="w-3.5 h-3.5 text-brand" />
              ماذا حدث ({visibleEvents.length})
            </div>
            <ol className="relative border-s border-border ms-2 ps-4 space-y-3">
              {visibleEvents.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -start-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-background" />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${actionTone(
                        r.action_type,
                      )}`}
                    >
                      {ACTION_LABELS[r.action_type] || r.action_type}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <UserIcon className="w-3 h-3" />
                      <bdi>{r.actor_display}</bdi>
                      {r.actor_email && r.actor_email !== r.actor_display && (
                        <span className="text-muted-foreground/70">({r.actor_email})</span>
                      )}
                    </span>
                    <span
                      className="ms-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
                      dir="ltr"
                    >
                      <Clock className="w-3 h-3" />
                      {fmtTime(r.created_at)}
                    </span>
                  </div>
                  {r.meta && Object.keys(r.meta).length > 0 && (
                    <div className="mt-1.5 space-y-1.5">
                      <MetaSummary meta={r.meta} />
                      <ChangesView changes={(r.meta as any)?.changes} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <bdi className={`font-bold ${mono ? "font-mono text-[10px] break-all" : ""}`}>{value}</bdi>
    </span>
  );
}

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (Array.isArray(v)) return v.length === 0 ? "-" : v.map(fmtVal).join("، ");
  if (typeof v === "object") {
    // localized {ar, en} objects
    if ("ar" in v || "en" in v) {
      return [v.ar, v.en].filter(Boolean).join(" / ") || "-";
    }
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 80) + "..." : s;
  }
  const s = String(v);
  return s.length > 120 ? s.slice(0, 120) + "..." : s;
}

function ChangesView({ changes }: { changes: any }) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const entries = Object.entries(changes).filter(
    ([, v]) => v && typeof v === "object" && ("from" in (v as any) || "to" in (v as any)),
  );
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-brand/25 bg-brand/5 p-2">
      <div className="text-[10px] font-bold text-brand mb-1.5">التغييرات ({entries.length})</div>
      <div className="grid gap-1">
        {entries.map(([field, val]: any) => (
          <div key={field} className="text-[11px] flex flex-wrap items-start gap-x-2 gap-y-0.5">
            <span className="font-bold min-w-[110px]">{FIELD_LABELS[field] || field}:</span>
            <span className="inline-flex flex-wrap items-center gap-1">
              <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through max-w-[380px] truncate">
                <bdi>{fmtVal(val.from)}</bdi>
              </span>
              <span className="text-muted-foreground">←</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 max-w-[380px] truncate">
                <bdi>{fmtVal(val.to)}</bdi>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaSummary({ meta }: { meta: any }) {
  if (!meta) return null;
  const chips: Array<{ label: string; value: string }> = [];
  const push = (label: string, val: any) => {
    if (val === null || val === undefined || val === "") return;
    chips.push({ label, value: fmtVal(val) });
  };
  push("المنتج", meta.product_name ?? meta.name_ar);
  push("الخطة", meta.label_ar);
  push("السؤال", meta.question_ar);
  push("المُقيّم", meta.reviewer_name);
  push("المفتاح", meta.key);
  push("المبلغ", meta.amount != null ? `${meta.amount} EGP` : undefined);
  push("النوع", meta.type);
  push("ملاحظات", meta.notes);
  push("من", meta.from);
  push("إلى", meta.to);
  push("الصلاحية", meta.role);

  // Coupon fields -from event meta or embedded snapshot
  const snap = meta.snapshot ?? {};
  const code = meta.code ?? snap.code;
  const dType = meta.discount_type ?? snap.discount_type;
  const dValue = meta.discount_value ?? snap.discount_value;
  const applies = meta.applies_to ?? snap.applies_to;
  const maxUses = snap.max_uses;
  const minOrder = snap.min_order_amount;
  const expires = snap.expires_at;
  const productIds = snap.product_ids;
  push("الكود", code);
  if (dValue != null) {
    push("الخصم", dType === "percent" ? `${dValue}%` : `${dValue} EGP`);
  }
  push("يطبّق على", applies === "all" ? "كل الخدمات" : applies === "products" ? "خدمات محددة" : applies);
  push("أقصى استخدام", maxUses);
  push("أدنى قيمة للطلب", minOrder != null ? `${minOrder} EGP` : undefined);
  push("ينتهي في", expires ? fmtTime(expires) : undefined);
  if (Array.isArray(productIds) && productIds.length) push("عدد المنتجات المحددة", productIds.length);

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{c.label}:</span>
          <bdi className="font-bold">{c.value}</bdi>
        </span>
      ))}
    </div>
  );
}
