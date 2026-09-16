import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Trash2,
  Search,
  Undo2,
  Receipt,
  ChevronDown,
  X,
  Plus,
  Banknote,
  ArrowLeftRight,
  TicketX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { AdminHero } from "@/components/AdminHero";
import { SiteButton } from "@/components/ui/site-button";

export const Route = createFileRoute("/_authenticated/admin/refunds")({
  component: AdminRefunds,
});

type Refund = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  amount: number;
  type: string;
  notes: string | null;
  created_at: string;
};

type TypeFilter = "all" | "full" | "partial" | "replacement";

const typeLabel = (t: string) =>
  t === "full" ? "ريفاند كامل" : t === "partial" ? "ريفاند جزئي" : "حساب بديل";

function AdminRefunds() {
  const { notify, confirm, lang } = useApp();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const refunds = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: async () => {
      // inner-join orders so orphan refunds (order deleted) never leak in
      const { data, error } = await supabase
        .from("refunds")
        .select("id, user_id, order_id, order_item_id, amount, type, notes, created_at, orders!inner(id, order_number, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Refund & { orders?: { id: string; order_number: string; status: string } })[];
    },
  });

  const orders = useQuery({
    queryKey: ["admin-orders-for-refunds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_email, customer_phone, subtotal, total, discount_amount, coupon_id, status, user_id, created_at, order_items(id, product_name, plan_label, quantity, frozen_unit_price, unit_price)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = orders.data ?? [];
    if (!q) return list.slice(0, 5);
    return list.filter((o: any) =>
      String(o.order_number ?? "").toLowerCase().includes(q) ||
      String(o.customer_email ?? "").toLowerCase().includes(q) ||
      String(o.customer_phone ?? "").toLowerCase().includes(q)
    );
  }, [orders.data, search]);

  const totals = (refunds.data ?? []).reduce(
    (acc, r) => {
      acc.total += Number(r.amount);
      if (r.type === "full") acc.full += Number(r.amount);
      else if (r.type === "partial") acc.partial += Number(r.amount);
      else acc.replacement += Number(r.amount);
      return acc;
    },
    { total: 0, full: 0, partial: 0, replacement: 0 },
  );

  const refundsByOrder = useMemo(() => {
    const m = new Map<string, Refund[]>();
    for (const r of refunds.data ?? []) {
      if (!r.order_id) continue;
      if (!m.has(r.order_id)) m.set(r.order_id, []);
      m.get(r.order_id)!.push(r);
    }
    return m;
  }, [refunds.data]);

  const history = useMemo(() => {
    const list = refunds.data ?? [];
    if (typeFilter === "all") return list;
    return list.filter((r) => r.type === typeFilter);
  }, [refunds.data, typeFilter]);

  const typeTabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: "all", label: isAr ? "الكل" : "All", count: (refunds.data ?? []).length },
    { key: "full", label: isAr ? "كامل" : "Full", count: (refunds.data ?? []).filter((r) => r.type === "full").length },
    { key: "partial", label: isAr ? "جزئي" : "Partial", count: (refunds.data ?? []).filter((r) => r.type === "partial").length },
    { key: "replacement", label: isAr ? "بديل" : "Replacement", count: (refunds.data ?? []).filter((r) => !["full", "partial"].includes(r.type)).length },
  ];

  const remove = async (id: string) => {
    const ok = await confirm({ message: isAr ? "حذف هذا التعويض؟" : "Delete this refund?", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("refunds").delete().eq("id", id);
    if (error) return notify(error.message, "error");
    notify(isAr ? "تم الحذف" : "Deleted", "success");
    qc.invalidateQueries({ queryKey: ["admin-refunds"] });
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
  };

  return (
    <div>
      <AdminHero
        icon={Undo2}
        title={isAr ? "التعويضات" : "Refunds"}
        subtitle={
          isAr
            ? `إجمالي ${totals.total} • كامل ${totals.full} • جزئي ${totals.partial} • بديل ${totals.replacement}`
            : `Total ${totals.total} • full ${totals.full} • partial ${totals.partial}`
        }
      />

      {/* ── Stats strip (clickable filters) ── */}
      <div className="mt-3 rounded-3xl border border-brand/15 bg-card p-3 shadow-sm sm:mt-4 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RefundStatButton
            icon={Banknote}
            value={totals.total}
            label={isAr ? "إجمالي التعويضات" : "Total refunded"}
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          />
          <RefundStatButton
            icon={TicketX}
            value={totals.full}
            label={isAr ? "ريفاند كامل" : "Full refunds"}
            active={typeFilter === "full"}
            onClick={() => setTypeFilter(typeFilter === "full" ? "all" : "full")}
          />
          <RefundStatButton
            icon={Receipt}
            value={totals.partial}
            label={isAr ? "ريفاند جزئي" : "Partial refunds"}
            active={typeFilter === "partial"}
            onClick={() => setTypeFilter(typeFilter === "partial" ? "all" : "partial")}
          />
          <RefundStatButton
            icon={ArrowLeftRight}
            value={totals.replacement}
            label={isAr ? "حساب بديل" : "Replacements"}
            active={typeFilter === "replacement"}
            onClick={() => setTypeFilter(typeFilter === "replacement" ? "all" : "replacement")}
          />
        </div>
      </div>

      {/* ── New refund: find an order ── */}
      <section className="mt-3 rounded-3xl border border-brand/15 bg-card p-4 shadow-sm sm:mt-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
          <span className="grid size-8 place-items-center rounded-xl bg-brand/10 text-brand">
            <Plus className="size-4" />
          </span>
          {isAr ? "إضافة تعويض جديد" : "New refund"}
        </h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "ابحث برقم الطلب أو الإيميل أو الواتساب..." : "Search order #, email or phone..."}
            className="w-full rounded-full border border-border bg-card py-2.5 ps-9 pe-9 text-sm outline-none transition-colors focus:border-brand"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={isAr ? "مسح البحث" : "Clear search"}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {search
            ? isAr
              ? `${visibleOrders.length} نتيجة`
              : `${visibleOrders.length} results`
            : isAr
              ? "أحدث 5 طلبات - ابحث لتحديد أوسع"
              : "Latest 5 orders - search to narrow down"}
        </p>

        <div className="mt-3 space-y-2.5">
          {visibleOrders.map((o: any) => {
            const orderRefunds = refundsByOrder.get(o.id) ?? [];
            const refundedSum = orderRefunds.reduce((s, r) => s + Number(r.amount ?? 0), 0);
            const isOpen = expandedOrder === o.id;
            return (
              <div
                key={o.id}
                className={`overflow-hidden rounded-2xl border bg-card transition ${isOpen ? "border-brand/50 shadow-sm" : "border-border/60 hover:border-brand/40"
                  }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedOrder(isOpen ? null : o.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-3 text-start sm:p-3.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/10 font-mono text-[10px] font-black text-brand">
                    #{String(o.order_number ?? o.id).slice(0, 6)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold sm:text-sm">
                      <span className="truncate">{o.customer_email || `#${o.order_number}`}</span>
                      {orderRefunds.length > 0 && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          {orderRefunds.length} {isAr ? "تعويض" : "refunds"} · -{refundedSum}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:text-xs">
                      {new Date(o.created_at).toLocaleDateString("en-GB")} · {o.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-base font-black tabular-nums">
                    {Math.round(Number(o.total ?? 0))} EGP
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180 text-brand" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-border/60 bg-background/60 px-3 py-3.5 sm:px-4">
                    {o.order_items?.map((it: any) => {
                      const itemRefunds = orderRefunds.filter((r) => r.order_item_id === it.id);
                      return (
                        <ItemRefundBlock
                          key={it.id}
                          orderId={o.id}
                          userId={o.user_id}
                          item={it}
                          orderSubtotal={Number(o.subtotal ?? o.total ?? 0)}
                          orderTotal={Number(o.total ?? 0)}
                          orderDiscount={Number(o.discount_amount ?? 0)}
                          refunds={itemRefunds}
                          onCreated={() => {
                            qc.invalidateQueries({ queryKey: ["admin-refunds"] });
                            qc.invalidateQueries({ queryKey: ["admin-orders"] });
                          }}
                          onRemove={remove}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {visibleOrders.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد نتائج" : "No results"}
            </p>
          )}
        </div>
      </section>

      {/* ── History ── */}
      <section className="mt-3 rounded-3xl border border-brand/15 bg-card p-4 shadow-sm sm:mt-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
            <span className="h-4 w-1 rounded-full bg-brand" />
            {isAr ? "سجل التعويضات" : "Refund history"}
            {(refunds.data ?? []).length > 0 && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-black text-brand tabular-nums">
                {history.length}
              </span>
            )}
          </h2>
          {(search || typeFilter !== "all") && (
            <button onClick={resetFilters} className="text-xs font-bold text-brand hover:underline">
              {isAr ? "مسح الفلاتر" : "Clear filters"}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {typeTabs.map((tab) => (
            <SiteButton
              key={tab.key}
              variant="filter"
              size="filter"
              filterActive={typeFilter === tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className="shrink-0"
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${typeFilter === tab.key ? "bg-white/25" : "bg-muted"
                  }`}
              >
                {tab.count}
              </span>
            </SiteButton>
          ))}
        </div>

        {history.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            {isAr ? "لا يوجد تعويضات" : "No refunds yet"}
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {history.map((r: any) => {
              const order = (r.orders as any) ?? orders.data?.find((o: any) => o.id === r.order_id);
              const fullOrder = orders.data?.find((o: any) => o.id === r.order_id) as any;
              const item = fullOrder?.order_items?.find((i: any) => i.id === r.order_item_id);
              const t = typeMeta(r.type, isAr);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 transition hover:border-brand/40 sm:p-3.5"
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${t.tile}`}>
                    <t.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold sm:text-sm">
                      <span className="tabular-nums text-destructive">-{r.amount} EGP</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.pill}`}>
                        {t.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:text-xs">
                      {order ? `#${order.order_number}` : "-"}
                      {item ? ` · ${item.product_name}` : ""}
                      {r.notes ? ` · ${r.notes}` : ""} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </span>
                  <button
                    onClick={() => remove(r.id)}
                    title={isAr ? "حذف التعويض" : "Delete refund"}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function typeMeta(type: string, isAr: boolean) {
  if (type === "full")
    return {
      label: isAr ? "كامل" : "Full",
      tile: "bg-destructive/10 text-destructive",
      pill: "bg-destructive/10 text-destructive",
      Icon: TicketX,
    };
  if (type === "partial")
    return {
      label: isAr ? "جزئي" : "Partial",
      tile: "bg-warning/15 text-warning",
      pill: "bg-warning/15 text-warning",
      Icon: Receipt,
    };
  return {
    label: isAr ? "بديل" : "Replacement",
    tile: "bg-brand/10 text-brand",
    pill: "bg-brand/10 text-brand",
    Icon: ArrowLeftRight,
  };
}

function RefundStatButton({
  icon: Icon,
  value,
  label,
  active,
  onClick,
}: {
  icon: any;
  value: number;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-center transition active:scale-95 ${active
          ? "border-brand/50 bg-brand/10"
          : "border-transparent bg-muted/50 hover:border-brand/40 hover:bg-brand/5"
        }`}
    >
      <span className="mx-auto mb-1 grid size-8 place-items-center rounded-full bg-white shadow-sm ring-1 ring-border/60">
        <Icon className="size-4 text-brand-deep" />
      </span>
      <span className="block text-lg font-black leading-tight text-destructive tabular-nums sm:text-xl">
        -{value}
      </span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">{label}</span>
    </button>
  );
}

function ItemRefundBlock({
  orderId,
  userId,
  item,
  orderSubtotal,
  orderTotal,
  orderDiscount,
  refunds,
  onCreated,
  onRemove,
}: {
  orderId: string;
  userId: string | null;
  item: any;
  orderSubtotal: number;
  orderTotal: number;
  orderDiscount: number;
  refunds: Refund[];
  onCreated: () => void;
  onRemove: (id: string) => void;
}) {
  const { notify, lang } = useApp();
  const isAr = lang === "ar";
  const grossAmount = Number(item.frozen_unit_price ?? item.unit_price) * Number(item.quantity);
  // Apply proportional discount to this item's share of the order.
  const hasDiscount = orderDiscount > 0 && orderSubtotal > 0 && orderTotal > 0;
  const ratio = hasDiscount ? orderTotal / orderSubtotal : 1;
  const maxAmount = hasDiscount ? Math.round(grossAmount * ratio) : grossAmount;
  const itemDiscount = hasDiscount ? grossAmount - maxAmount : 0;
  const [type, setType] = useState<"full" | "partial" | "replacement">("partial");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!userId) {
      notify(isAr ? "لا يمكن إضافة تعويض لطلب زائر بدون حساب" : "Guest orders can't receive refunds", "error");
      return;
    }
    const finalAmount = type === "full" ? maxAmount : Number(amount);
    if (!finalAmount || finalAmount <= 0) {
      notify(isAr ? "أدخل مبلغ صحيح" : "Enter a valid amount", "error");
      return;
    }
    const { error } = await supabase.from("refunds").insert({
      user_id: userId,
      order_id: orderId,
      order_item_id: item.id,
      amount: finalAmount,
      type,
      notes: notes || null,
    });
    if (error) return notify(error.message, "error");
    notify(isAr ? "تم تسجيل التعويض" : "Refund recorded", "success");
    setAmount(0);
    setNotes("");
    setType("partial");
    onCreated();
  };

  const typeOptions: { key: "partial" | "full" | "replacement"; label: string }[] = [
    { key: "partial", label: isAr ? "جزئي" : "Partial" },
    { key: "full", label: isAr ? "كامل" : "Full" },
    { key: "replacement", label: isAr ? "بديل" : "Replacement" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-extrabold">{item.product_name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.plan_label} × {item.quantity} · {item.frozen_unit_price ?? item.unit_price} EGP
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-muted/50 px-3 py-2 text-end text-xs font-bold">
          {hasDiscount ? (
            <div className="space-y-0.5">
              <div className="font-normal text-muted-foreground line-through tabular-nums">
                {grossAmount} EGP
              </div>
              <div className="font-normal text-destructive tabular-nums">-{itemDiscount} EGP</div>
              <div className="tabular-nums">{maxAmount} EGP</div>
            </div>
          ) : (
            <div className="tabular-nums">{maxAmount} EGP</div>
          )}
        </div>
      </div>

      {refunds.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {refunds.map((r) => {
            const t = typeMeta(r.type, isAr);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
              >
                <div className="min-w-0 truncate">
                  <span className="font-black text-destructive tabular-nums">-{r.amount} EGP</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span className="font-bold">{t.label}</span>
                  {r.notes && <span className="mx-1.5 text-muted-foreground">· {r.notes}</span>}
                </div>
                <button
                  onClick={() => onRemove(r.id)}
                  className="grid size-7 shrink-0 place-items-center rounded-full text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {typeOptions.map((o) => (
            <SiteButton
              key={o.key}
              variant="filter"
              size="filter"
              filterActive={type === o.key}
              onClick={() => setType(o.key)}
              className="shrink-0"
            >
              {o.label}
            </SiteButton>
          ))}
          {type === "full" && (
            <span className="ms-auto shrink-0 text-[11px] font-bold text-muted-foreground tabular-nums">
              {isAr ? "المبلغ الكامل:" : "Full amount:"} {maxAmount} EGP
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            placeholder={type === "full" ? `${maxAmount}` : isAr ? "المبلغ" : "Amount"}
            value={type === "full" ? maxAmount : amount || ""}
            disabled={type === "full"}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full rounded-full border border-border bg-background px-4 py-2 text-xs outline-none transition-colors focus:border-brand disabled:opacity-60 sm:max-w-[140px]"
          />
          <input
            placeholder={isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full flex-1 rounded-full border border-border bg-background px-4 py-2 text-xs outline-none transition-colors focus:border-brand"
          />
          <SiteButton variant="danger" size="sm" onClick={submit} className="shrink-0">
            <Undo2 className="size-3.5" />
            {isAr ? "إضافة تعويض" : "Add refund"}
          </SiteButton>
        </div>
      </div>
    </div>
  );
}
