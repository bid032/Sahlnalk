import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  Hourglass,
  LayoutDashboard,
  Mail,
  Package,
  Percent,
  Phone,
  Receipt,
  ShoppingBag,
  StickyNote,
  TrendingUp,
  Undo2,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    // Only admin can access the overview page
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/admin/products" });
  },
  component: AdminOverview,
});

type MonthKey = string; // YYYY-MM or "all"

function AdminOverview() {
  const { t, lang } = useApp();
  const [month, setMonth] = useState<MonthKey>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const range = useMemo(() => {
    if (month === "all") return { start: null as string | null, end: null as string | null };
    const [y, m] = month.split("-").map(Number);
    // Local-time month boundaries so orders bucket by the user's local calendar day.
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    return { start, end };
  }, [month]);

  const stats = useQuery({
    queryKey: ["admin-stats", month],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      // Light counts only (head: true) + the revenue RPC - no full row scans.
      let allOrdersQ = supabase.from("orders").select("id, status, payment_gateway");
      if (range.start) allOrdersQ = allOrdersQ.gte("created_at", range.start);
      if (range.end) allOrdersQ = allOrdersQ.lt("created_at", range.end);
      let processingQ = supabase
        .from("orders")
        .select("id, status, payment_gateway")
        .in("status", ["pending", "paid", "processing"]);
      if (range.start) processingQ = processingQ.gte("created_at", range.start);
      if (range.end) processingQ = processingQ.lt("created_at", range.end);

      const [rev, products, users, allOrdersRes, processingRes] = await Promise.all([
        supabase.rpc("admin_revenue_stats", {
          _start: range.start ?? undefined,
          _end: range.end ?? undefined,
        }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        allOrdersQ,
        processingQ,
      ]);

      const isUnpaidPaypal = (o: any) => o.payment_gateway === "paypal" && o.status === "pending";
      const validAllOrdersCount = (allOrdersRes.data ?? []).filter(
        (o) => !isUnpaidPaypal(o),
      ).length;
      const validProcessingCount = (processingRes.data ?? []).filter(
        (o) => !isUnpaidPaypal(o),
      ).length;

      const row = (rev.data as any[])?.[0] ?? {
        revenue: 0,
        profit: 0,
        orders_count: 0,
        items_count: 0,
      };
      return {
        revenue: Number(row.revenue ?? 0),
        profit: Number(row.profit ?? 0),
        ordersCount: validAllOrdersCount,
        processingCount: validProcessingCount,
        products: products.count ?? 0,
        users: users.count ?? 0,
      };
    },
  });

  const monthly = useQuery({
    queryKey: ["admin-revenue-monthly"],
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_revenue_by_month");
      return (data ?? []) as {
        month: string;
        revenue: number;
        profit: number;
        orders_count: number;
      }[];
    },
  });

  const refundsAll = useQuery({
    queryKey: ["admin-refunds-all"],
    queryFn: async () => {
      // Light: amounts + dates only, bucketed client-side by order date.
      const { data } = await supabase
        .from("refunds")
        .select("amount, created_at, orders!inner(created_at, status)")
        .in("orders.status", ["paid", "delivered", "refunded"]);
      return (data ?? []).map((r: any) => ({
        amount: Number(r.amount ?? 0),
        // basis_at = order's created_at; fall back to refund's own date if missing
        basis_at: (r.orders?.created_at as string) ?? r.created_at,
      })) as { amount: number; basis_at: string }[];
    },
  });

  // Latest orders with contact + financial details for the expandable rows
  // (full management lives in /admin/orders).
  const latest = useQuery({
    queryKey: ["admin-latest-orders"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total, subtotal, discount_amount, customer_name, customer_email, customer_phone, payment_gateway, notes, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Light month details for DAILY profit (unit/cost only - no joins).
  const monthDetails = useQuery({
    queryKey: ["admin-month-details", month],
    enabled: month !== "all",
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("order_items")
        .select(
          "plan_id, quantity, frozen_unit_price, unit_price, frozen_cost_price, orders!inner(created_at, status, payment_gateway)",
        )
        .order("created_at", { ascending: true });
      if (range.start) q = q.gte("orders.created_at", range.start);
      if (range.end) q = q.lt("orders.created_at", range.end);
      const { data, error } = await q;
      if (error) throw error;
      const items = ((data ?? []) as any[]).filter((r) => {
        const o = r.orders;
        if (o?.payment_gateway === "paypal" && o?.status === "pending") return false;
        return ["paid", "delivered", "refunded"].includes(o?.status);
      });
      const needsCosts = items.some((r) => r.frozen_cost_price == null && r.plan_id);
      const costMap = new Map<string, number>();
      if (needsCosts) {
        const planIds = Array.from(new Set(items.map((r) => r.plan_id).filter(Boolean)));
        if (planIds.length) {
          const { data: costs } = await supabase
            .from("plan_costs")
            .select("plan_id, cost_price")
            .in("plan_id", planIds);
          (costs ?? []).forEach((c: any) => costMap.set(c.plan_id, Number(c.cost_price ?? 0)));
        }
      }
      return items.map((r) => {
        const qty = Number(r.quantity ?? 0);
        const unit = Number(r.frozen_unit_price ?? r.unit_price ?? 0);
        const cost =
          r.frozen_cost_price != null ? Number(r.frozen_cost_price) : (costMap.get(r.plan_id) ?? 0);
        return { day: new Date(r.orders.created_at).getDate(), profit: (unit - cost) * qty };
      });
    },
  });

  const refundsTotal = useMemo(() => {
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      if (range.start && t < new Date(range.start).getTime()) return false;
      if (range.end && t >= new Date(range.end).getTime()) return false;
      return true;
    };
    return Math.round(
      (refundsAll.data ?? [])
        .filter((r) => inRange(r.basis_at))
        .reduce((s, r) => s + Number(r.amount ?? 0), 0),
    );
  }, [refundsAll.data, range]);

  // Light month orders for the daily chart (totals only - no joins).
  const monthOrders = useQuery({
    queryKey: ["admin-month-orders", month],
    enabled: month !== "all",
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, total, status, payment_gateway, created_at")
        .order("created_at", { ascending: true });
      if (range.start) q = q.gte("created_at", range.start);
      if (range.end) q = q.lt("created_at", range.end);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const chartData = useMemo(() => {
    if (month === "all") {
      const rows = (monthly.data ?? []).map((r) => ({
        bucket: r.month.slice(0, 7),
        revenue: Math.round(Number(r.revenue ?? 0)),
        profit: Math.round(Number(r.profit ?? 0)),
        refunds: 0,
      }));
      (refundsAll.data ?? []).forEach((r) => {
        const d = new Date(r.basis_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const row = rows.find((x) => x.bucket === key);
        const amt = Math.round(Number(r.amount ?? 0));
        if (row) row.refunds += amt;
        else rows.push({ bucket: key, revenue: 0, profit: 0, refunds: amt });
      });
      rows.sort((a, b) => a.bucket.localeCompare(b.bucket));
      return rows.slice(-12);
    }
    // Specific month → daily buckets: revenue from light order totals,
    // profit from light unit/cost details.
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const rows = Array.from({ length: daysInMonth }, (_, i) => ({
      bucket: String(i + 1).padStart(2, "0"),
      revenue: 0,
      profit: 0,
      refunds: 0,
    }));
    const validStatuses = new Set(["paid", "delivered", "refunded"]);
    (monthOrders.data ?? []).forEach((o: any) => {
      if (o.payment_gateway === "paypal" && o.status === "pending") return;
      if (!validStatuses.has(o.status)) return;
      const d = new Date(o.created_at);
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return;
      rows[d.getDate() - 1].revenue += Math.round(Number(o.total ?? 0));
    });
    (monthDetails.data ?? []).forEach((it: any) => {
      const idx = Number(it.day) - 1;
      if (idx >= 0 && idx < rows.length) rows[idx].profit += Math.round(Number(it.profit ?? 0));
    });
    (refundsAll.data ?? []).forEach((r) => {
      const d = new Date(r.basis_at);
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return;
      const idx = d.getDate() - 1;
      const amt = Math.round(Number(r.amount ?? 0));
      rows[idx].refunds += amt;
      rows[idx].profit -= amt;
    });
    return rows;
  }, [monthly.data, refundsAll.data, monthOrders.data, monthDetails.data, month]);

  const monthOptions = useMemo(() => {
    const arr = (monthly.data ?? []).map((r) => r.month.slice(0, 7));
    // ensure current month present
    const now = new Date();
    const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!arr.includes(cur)) arr.unshift(cur);
    return arr;
  }, [monthly.data]);

  const revenue = Math.round(Number(stats.data?.revenue ?? 0));
  const profit = Math.round(Number(stats.data?.profit ?? 0));
  const margin = revenue ? Math.round((profit / revenue) * 100) : 0;

  const kpis = [
    {
      label: "الإيرادات",
      value: `${revenue} ${t.common.currency}`,
      icon: Banknote,
      tile: "bg-brand/10 text-brand",
    },
    {
      label: "الأرباح",
      value: `${profit} ${t.common.currency}`,
      icon: Wallet,
      tile: "bg-success/10 text-success",
    },
    {
      label: "التعويضات",
      value: `${refundsTotal} ${t.common.currency}`,
      icon: Undo2,
      tile: "bg-destructive/10 text-destructive",
    },
    {
      label: "هامش الربح",
      value: `${margin}%`,
      icon: Percent,
      tile: "bg-warning/10 text-warning",
    },
  ];

  const statCards = [
    {
      label: "عدد الطلبات",
      value: stats.data?.ordersCount ?? 0,
      icon: ShoppingBag,
      tone: "text-brand",
      bg: "bg-brand/10",
    },
    {
      label: "قيد التجهيز",
      value: stats.data?.processingCount ?? 0,
      icon: Hourglass,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: t.admin.totalProducts,
      value: stats.data?.products ?? 0,
      icon: Package,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: t.admin.totalUsers,
      value: stats.data?.users ?? 0,
      icon: Users,
      tone: "text-brand-deep",
      bg: "bg-brand/10",
    },
  ];

  const statusStyle: Record<string, string> = {
    delivered: "border-success/30 bg-success/10 text-success",
    paid: "border-brand/30 bg-brand/10 text-brand",
    processing: "border-warning/30 bg-warning/10 text-warning",
    pending: "border-warning/30 bg-warning/10 text-warning",
    refunded: "border-destructive/30 bg-destructive/10 text-destructive",
  };

  const todayLabel = new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const exportOverviewXlsx = () => {
    const period = month === "all" ? "كل الفترات" : month;
    const summaryRows = [
      { البند: "الفترة", القيمة: period },
      { البند: "الإيرادات", القيمة: `${revenue} ${t.common.currency}` },
      { البند: "الأرباح", القيمة: `${profit} ${t.common.currency}` },
      { البند: "التعويضات", القيمة: `${refundsTotal} ${t.common.currency}` },
      { البند: "هامش الربح", القيمة: `${margin}%` },
      { البند: "عدد الطلبات", القيمة: stats.data?.ordersCount ?? 0 },
      { البند: "قيد التجهيز", القيمة: stats.data?.processingCount ?? 0 },
      { البند: "المنتجات", القيمة: stats.data?.products ?? 0 },
      { البند: "العملاء", القيمة: stats.data?.users ?? 0 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "ملخص");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        chartData.map((r) => ({
          الفترة: r.bucket,
          الإيرادات: r.revenue,
          الأرباح: r.profit,
          التعويضات: r.refunds,
        })),
      ),
      month === "all" ? "شهري" : "يومي",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        (latest.data ?? []).map((o: any) => ({
          "رقم الطلب": o.order_number,
          العميل: o.customer_name ?? "",
          البريد: o.customer_email ?? "",
          الواتساب: o.customer_phone ?? "",
          الإجمالي: o.total,
          الحالة: o.status,
          الدفع: o.payment_gateway ?? "",
          التاريخ: o.created_at,
        })),
      ),
      "أحدث الطلبات",
    );
    XLSX.writeFile(wb, `overview-${month === "all" ? "all" : month}.xlsx`);
  };

  return (
    <div>
      {/* ── Cover header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:rounded-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
          }}
        />
        <LayoutDashboard
          aria-hidden
          className="pointer-events-none absolute -bottom-8 end-6 size-36 rotate-[-8deg] text-white/25 select-none sm:size-48"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="min-w-0">
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              {todayLabel}
            </p>
            <h1 className="truncate text-xl font-extrabold tracking-tight text-white drop-shadow-md sm:text-3xl">
              {t.admin.overview}
            </h1>
            <p className="mt-0.5 truncate text-xs text-white/85 drop-shadow sm:text-sm">
              {month === "all" ? "نظرة شاملة على أداء المتجر" : `أداء شهر ${month}`}
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/25 sm:text-sm">
            <CalendarDays className="size-4" />
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="cursor-pointer bg-transparent outline-none [&>option]:text-foreground"
              aria-label="فلتر الشهر"
            >
              <option value="all">كل الفترات</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportOverviewXlsx}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#0b3fa0] shadow-lg transition hover:brightness-95 active:scale-95 sm:text-sm"
          >
            <Download className="size-4" />
            تقرير Excel
          </button>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:p-5"
          >
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-2xl sm:size-12 ${k.tile}`}
            >
              <k.icon className="size-5 sm:size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">
                {k.label}
              </span>
              <span className="block truncate text-lg font-black tabular-nums sm:text-2xl">
                {k.value}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Chart + store pulse ── */}
      <div className="mt-3 grid items-start gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
              <span className="h-4 w-1 rounded-full bg-brand" />
              أداء الشهور
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/5 px-2.5 py-1 text-[11px] font-bold text-brand">
              <TrendingUp className="size-3.5" />
              {month === "all" ? "آخر 12 شهر" : `يومي - ${month}`}
            </span>
          </div>

          <div className="h-64 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="gRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="gProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="var(--border)"
                  opacity={0.35}
                  vertical={false}
                />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--brand) 8%, transparent)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    fontSize: 12,
                    boxShadow: "0 10px 40px -10px rgba(0,0,0,0.4)",
                  }}
                  formatter={(v: any) => `${v} ${t.common.currency}`}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                <Bar
                  dataKey="revenue"
                  name="الإيرادات"
                  fill="url(#gRev)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={44}
                  animationDuration={900}
                />
                <Bar
                  dataKey="refunds"
                  name="التعويضات"
                  fill="url(#gRef)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={44}
                  animationDuration={900}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="منطقة الأرباح"
                  stroke="none"
                  fill="url(#gProf)"
                  animationDuration={1200}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="الأرباح"
                  stroke="var(--success)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--success)" }}
                  activeDot={{ r: 6 }}
                  animationDuration={1200}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <aside className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm sm:rounded-3xl">
          <p className="border-b border-border/60 bg-background/60 px-4 py-3 text-xs font-extrabold sm:text-sm">
            نبض المتجر
          </p>
          <dl className="divide-y divide-border/50">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-background/60"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${c.bg} ${c.tone}`}
                >
                  <c.icon className="size-[18px]" />
                </span>
                <dt className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-[13px]">
                  {c.label}
                </dt>
                <dd className="shrink-0 text-lg font-black tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <section className="mt-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:mt-4 sm:rounded-3xl sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2.5 text-base font-extrabold sm:text-lg">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-white shadow-sm">
              <Receipt className="size-4" />
            </span>
            أحدث الطلبات
            {(latest.data ?? []).length > 0 && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-black text-brand tabular-nums">
                {(latest.data ?? []).length}
              </span>
            )}
          </h2>
          <Link
            to="/admin/orders"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold transition hover:border-brand/60 hover:bg-brand/5 hover:text-brand active:scale-95 sm:text-sm"
          >
            {lang === "ar" ? "عرض الكل في الطلبات" : "View all in Orders"}
          </Link>
        </div>
        {(latest.data ?? []).length === 0 ? (
          <div className="px-4 py-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-white shadow-lg">
              <ShoppingBag className="size-6" />
            </span>
            <p className="mt-3 text-sm font-bold">
              {latest.isLoading ? t.common.loading : "لا توجد طلبات بعد"}
            </p>
            {!latest.isLoading && (
              <p className="mt-1 text-xs text-muted-foreground">الطلبات الجديدة هتظهر هنا أول بأول</p>
            )}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {(latest.data ?? []).map((o: any) => {
              const expanded = expandedOrder === o.id;
              const subtotal = Math.round(Number(o.subtotal ?? o.total ?? 0));
              const orderDiscount = Math.round(Number(o.discount_amount ?? 0));
              const total = Math.round(Number(o.total ?? 0));
              const name = o.customer_name || o.customer_email || "-";
              const initial = String(name).trim().slice(0, 1).toUpperCase();
              const needsAttention = ["pending", "paid", "processing"].includes(o.status);
              return (
                <li
                  key={o.id}
                  className={`overflow-hidden rounded-2xl border bg-card transition ${expanded
                      ? "border-brand/50 shadow-md"
                      : "border-border/60 hover:border-brand/40 hover:shadow-sm"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedOrder(expanded ? null : o.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 p-3 text-start outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:p-3.5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-base font-black text-white shadow sm:size-12">
                      {initial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13px] font-extrabold sm:text-sm">
                          {name}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] font-bold text-muted-foreground">
                          #{o.order_number}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${statusStyle[o.status] ?? "border-border bg-muted text-muted-foreground"}`}
                        >
                          {needsAttention && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                            </span>
                          )}
                          {o.status}
                        </span>
                        <span className="truncate">
                          {new Date(o.created_at).toLocaleDateString("en-GB")} •{" "}
                          {o.payment_gateway ?? ""}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-base font-black tabular-nums text-brand-deep sm:text-lg">
                        {total} {t.common.currency}
                      </span>
                      {orderDiscount > 0 && (
                        <span className="mt-0.5 block text-[10px] font-bold text-success tabular-nums">
                          خصم {orderDiscount}
                        </span>
                      )}
                    </span>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full border transition ${expanded
                          ? "border-brand/50 bg-brand/10 text-brand"
                          : "border-border/60 text-muted-foreground"
                        }`}
                    >
                      <ChevronDown
                        className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>
                  {expanded && (
                    <div className="grid animate-in fade-in gap-2.5 border-t border-border/60 bg-background/60 p-3 text-xs sm:grid-cols-3 sm:p-4">
                      <div className="min-w-0 rounded-2xl bg-muted/50 p-3">
                        <p className="mb-2 flex items-center gap-1.5 font-extrabold text-muted-foreground">
                          <User className="size-3.5 text-brand-deep" />
                          العميل
                        </p>
                        <p className="truncate text-[13px] font-extrabold">
                          {o.customer_name || "-"}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-muted-foreground">
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{o.customer_email || "-"}</span>
                        </p>
                        {o.customer_phone && (
                          <p className="mt-1 flex items-center gap-1.5 truncate text-muted-foreground">
                            <Phone className="size-3.5 shrink-0" />
                            <span className="truncate" dir="ltr">
                              {o.customer_phone}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 rounded-2xl bg-muted/50 p-3">
                        <p className="mb-2 flex items-center gap-1.5 font-extrabold text-muted-foreground">
                          <CreditCard className="size-3.5 text-brand-deep" />
                          الدفع والطلب
                        </p>
                        <p className="truncate">
                          الطريقة:{" "}
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                            {o.payment_gateway ?? "-"}
                          </span>
                        </p>
                        <p className="mt-1.5 truncate text-muted-foreground">
                          التاريخ:{" "}
                          {new Date(o.created_at).toLocaleString("en-GB", { hour12: true })}
                        </p>
                        {o.notes ? (
                          <p className="mt-1.5 flex items-start gap-1.5 text-muted-foreground">
                            <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                            <span className="line-clamp-2">{o.notes}</span>
                          </p>
                        ) : (
                          <p className="mt-1.5 text-muted-foreground">لا توجد ملاحظات</p>
                        )}
                      </div>
                      <div className="min-w-0 rounded-2xl border border-brand/20 bg-gradient-to-b from-brand/[0.07] to-transparent p-3">
                        <p className="mb-2 flex items-center gap-1.5 font-extrabold text-muted-foreground">
                          <Receipt className="size-3.5 text-brand-deep" />
                          الإجمالي
                        </p>
                        <p className="flex items-center justify-between text-muted-foreground">
                          <span>الفرعي</span>
                          <b className="tabular-nums">
                            {subtotal} {t.common.currency}
                          </b>
                        </p>
                        {orderDiscount > 0 && (
                          <p className="mt-1 flex items-center justify-between text-success">
                            <span>الخصم</span>
                            <b className="tabular-nums">
                              -{orderDiscount} {t.common.currency}
                            </b>
                          </p>
                        )}
                        <p className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5 text-sm font-black tabular-nums">
                          <span>{t.cart.total}</span>
                          <span>
                            {total} {t.common.currency}
                          </span>
                        </p>
                        <Link
                          to="/admin/orders"
                          className="btn-shine mt-2.5 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] px-4 py-2 text-xs font-extrabold text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_10px_25px_-10px_rgba(11,95,192,0.65)] transition hover:brightness-110 active:scale-95"
                        >
                          {lang === "ar" ? "إدارة كاملة" : "Full management"}
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
