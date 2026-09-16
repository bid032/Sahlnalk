import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, Pencil, X, Check, TicketPercent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AdminHero, HeroAction } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/coupons")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    // Admins and moderators can both manage coupons (RLS allows staff).
    const canAccess = roles?.some(r => r.role === "admin" || r.role === "moderator");
    if (!canAccess) throw redirect({ to: "/admin/products" });
  },
  component: AdminCoupons,
});

type Coupon = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  min_order_amount: number | null;
  applies_to: "all" | "specific";
  product_ids: string[];
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusOf(c: Coupon): { label: string; cls: string } {
  if (!c.is_active) return { label: "موقوف", cls: "bg-muted text-muted-foreground" };
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return { label: "منتهي", cls: "bg-destructive/15 text-destructive" };
  if (c.max_uses !== null && c.used_count >= c.max_uses)
    return { label: "مستنفد", cls: "bg-warning/15 text-warning" };
  return { label: "نشط", cls: "bg-success/15 text-success" };
}

function AdminCoupons() {
  const { notify, confirm } = useApp();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);

  const coupons = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coupons.data ?? [];
    return (coupons.data ?? []).filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q),
    );
  }, [coupons.data, search]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify("تم الحذف", "success");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (e: any) => notify(e.message, "error"),
  });

  return (
    <div className="space-y-4">
      <AdminHero
        icon={TicketPercent}
        title="أكواد الخصم"
        subtitle={`${coupons.data?.length ?? 0} كوبون • إدارة الخصومات والعروض`}
        actions={
          <HeroAction onClick={() => setCreating(true)}>
            <Plus className="size-4" /> إضافة كوبون
          </HeroAction>
        }
      />

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالكود أو الملاحظات…"
          className="w-full ps-10 pe-3 py-2.5 bg-background border border-border rounded-lg"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_0.9fr_0.7fr_auto] gap-3 px-4 py-3 text-xs font-bold text-muted-foreground border-b border-border bg-muted/40">
          <div>الكود</div>
          <div>الخصم</div>
          <div>الاستخدامات</div>
          <div>ينتهي</div>
          <div>يطبق على</div>
          <div>الحالة</div>
          <div className="text-end">إجراءات</div>
        </div>
        {coupons.isLoading && <div className="p-6 text-center text-sm text-muted-foreground">…</div>}
        {!coupons.isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد كوبونات</div>
        )}
        <div className="divide-y divide-border">
          {filtered.map((c) => {
            const st = statusOf(c);
            return (
              <div
                key={c.id}
                className="grid md:grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_0.9fr_0.7fr_auto] gap-3 px-4 py-3 items-center text-sm"
              >
                <div className="min-w-0">
                  <div className="font-mono font-extrabold text-brand text-base">{c.code}</div>
                  {c.notes && <div className="text-[11px] text-muted-foreground truncate">{c.notes}</div>}
                </div>
                <div className="font-bold">
                  {c.discount_type === "percent" ? `${c.discount_value}%` : `${c.discount_value} EGP`}
                </div>
                <div>
                  <span className="font-bold">{c.used_count}</span>
                  <span className="text-muted-foreground"> / {c.max_uses ?? "∞"}</span>
                </div>
                <div className="text-xs">
                  {c.expires_at
                    ? new Date(c.expires_at).toLocaleDateString("ar-EG")
                    : <span className="text-muted-foreground">بدون</span>}
                </div>
                <div className="text-xs">
                  {c.applies_to === "all" ? "كل الخدمات" : `${c.product_ids.length} خدمة`}
                </div>
                <div>
                  <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => setEditing(c)}
                    className="p-2 rounded-lg hover:bg-muted"
                    title="تعديل"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: "حذف الكوبون؟",
                        message: `سيتم حذف الكود ${c.code} نهائيًا.`,
                        confirmLabel: "حذف",
                      });
                      if (ok) del.mutate(c.id);
                    }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                    title="حذف"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(creating || editing) && (
        <CouponEditor
          coupon={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-coupons"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CouponEditor({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useApp();
  const [code, setCode] = useState(coupon?.code ?? "");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(coupon?.discount_type ?? "percent");
  const [discountValue, setDiscountValue] = useState<string>(String(coupon?.discount_value ?? 10));
  const [maxUses, setMaxUses] = useState<string>(coupon?.max_uses?.toString() ?? "");
  const [expiresAt, setExpiresAt] = useState<string>(toDatetimeLocal(coupon?.expires_at ?? null));
  const [minOrder, setMinOrder] = useState<string>(coupon?.min_order_amount?.toString() ?? "");
  const [appliesTo, setAppliesTo] = useState<"all" | "specific">(coupon?.applies_to ?? "all");
  const [productIds, setProductIds] = useState<string[]>(coupon?.product_ids ?? []);
  const [isActive, setIsActive] = useState<boolean>(coupon?.is_active ?? true);
  const [notes, setNotes] = useState(coupon?.notes ?? "");
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const products = useQuery({
    queryKey: ["coupon-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name_ar, name_en, slug")
        .order("name_ar");
      return data ?? [];
    },
    enabled: appliesTo === "specific",
  });

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.data ?? [];
    return (products.data ?? []).filter(
      (p: any) =>
        p.name_ar?.toLowerCase().includes(q) ||
        p.name_en?.toLowerCase().includes(q) ||
        p.slug?.toLowerCase().includes(q),
    );
  }, [products.data, productSearch]);

  const save = async () => {
    if (!code.trim()) {
      notify("أدخل كود الخصم", "error");
      return;
    }
    const dv = Number(discountValue);
    if (!(dv > 0)) {
      notify("قيمة الخصم غير صحيحة", "error");
      return;
    }
    if (discountType === "percent" && dv > 100) {
      notify("النسبة لا يمكن أن تتجاوز 100%", "error");
      return;
    }
    if (appliesTo === "specific" && productIds.length === 0) {
      notify("اختر خدمة واحدة على الأقل", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: dv,
        max_uses: maxUses.trim() ? Number(maxUses) : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        min_order_amount: minOrder.trim() ? Number(minOrder) : null,
        applies_to: appliesTo,
        product_ids: appliesTo === "specific" ? productIds : [],
        is_active: isActive,
        notes: notes.trim() || null,
      };
      if (coupon) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", coupon.id);
        if (error) throw error;
        notify("تم التحديث", "success");
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
        notify("تم الإنشاء", "success");
      }
      onSaved();
    } catch (e: any) {
      notify(e.message ?? "خطأ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm grid place-items-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <h2 className="font-extrabold text-lg">{coupon ? "تعديل كوبون" : "إضافة كوبون"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">الكود</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="SUMMER25"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg font-mono font-bold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">الحالة</span>
              <div className="flex items-center gap-2 h-[42px]">
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative w-14 h-7 rounded-full transition ${isActive ? "bg-success" : "bg-muted"}`}
                >
                  <span
                    className={`absolute top-0.5 size-6 bg-white rounded-full transition ${isActive ? "start-[30px]" : "start-0.5"}`}
                  />
                </button>
                <span className="text-sm font-bold">{isActive ? "نشط" : "موقوف"}</span>
              </div>
            </label>
          </div>

          <div className="grid sm:grid-cols-[1fr_1fr] gap-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">نوع الخصم</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  className={`py-2 rounded-md text-sm font-bold transition ${discountType === "percent" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  نسبة %
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("fixed")}
                  className={`py-2 rounded-md text-sm font-bold transition ${discountType === "fixed" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  مبلغ ثابت
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">
                القيمة {discountType === "percent" ? "(%)" : "(EGP)"}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg font-bold"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">الحد الأقصى للاستخدام</span>
              <input
                type="number"
                min={0}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="لا نهائي"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground mb-1 block">تاريخ الانتهاء</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground mb-1 block">الحد الأدنى للطلب (اختياري)</span>
            <input
              type="number"
              min={0}
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              placeholder="بدون حد أدنى"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg"
            />
          </label>

          <div>
            <span className="text-xs font-bold text-muted-foreground mb-2 block">يطبق على</span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setAppliesTo("all")}
                className={`py-2 rounded-md text-sm font-bold transition ${appliesTo === "all" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                كل الخدمات
              </button>
              <button
                type="button"
                onClick={() => setAppliesTo("specific")}
                className={`py-2 rounded-md text-sm font-bold transition ${appliesTo === "specific" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                خدمات محددة
              </button>
            </div>

            {appliesTo === "specific" && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="relative border-b border-border">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="ابحث عن خدمة…"
                    className="w-full ps-10 pe-3 py-2 bg-background text-sm"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredProducts.map((p: any) => {
                    const checked = productIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm border-b border-border/50 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setProductIds([...productIds, p.id]);
                            else setProductIds(productIds.filter((id) => id !== p.id));
                          }}
                          className="accent-brand"
                        />
                        <span className="flex-1 truncate">{p.name_ar || p.name_en}</span>
                        {checked && <Check className="size-4 text-brand" />}
                      </label>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="p-6 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
                  )}
                </div>
                <div className="px-3 py-2 bg-muted/40 text-xs text-muted-foreground border-t border-border">
                  {productIds.length} خدمة مختارة
                </div>
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground mb-1 block">ملاحظات داخلية</span>
            <RichTextEditor
              value={notes}
              onChange={setNotes}
              dir="rtl"
              lang="ar"
              minHeight={120}
              placeholder="لمرجعية الفريق فقط"
            />
          </label>

        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border font-bold hover:bg-muted">
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-brand text-brand-foreground font-bold hover:brand-glow disabled:opacity-50"
          >
            {saving ? "…" : coupon ? "حفظ" : "إضافة"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
