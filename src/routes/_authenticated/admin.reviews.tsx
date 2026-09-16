import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Save, X, Pencil, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/error-handler";
import { useApp } from "@/contexts/AppContext";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AdminHero } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: AdminReviews,
});

type Review = {
  id: string;
  product_id: string;
  reviewer_name: string;
  rating: number;
  body: string;
  lang: "ar" | "en";
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

function AdminReviews() {
  const qc = useQueryClient();
  const { lang, confirm: confirmDialog } = useApp();
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Review>>({
    reviewer_name: "",
    rating: 5,
    body: "",
    lang: "ar",
    is_active: true,
    sort_order: 0,
  });

  const products = useQuery({
    queryKey: ["admin-products-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name_ar, name_en")
        .order("name_ar");
      return data ?? [];
    },
  });

  const reviews = useQuery({
    queryKey: ["admin-product-reviews", selectedProduct],
    enabled: !!selectedProduct,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", selectedProduct)
        .order("sort_order")
        .order("created_at", { ascending: false });
      return (data ?? []) as Review[];
    },
  });

  const productLabel = (p: any) => p.name_ar || p.name_en || ",";

  const resetDraft = () => {
    setEditingId(null);
    setDraft({
      reviewer_name: "",
      rating: 5,
      body: "",
      lang: "ar",
      is_active: true,
      sort_order: 0,
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("اختر خدمة أولاً");
      if (!draft.reviewer_name?.trim() || !draft.body?.trim()) {
        throw new Error("لازم اسم المراجع ونص التقييم");
      }
      const payload = {
        product_id: selectedProduct,
        reviewer_name: draft.reviewer_name!.trim(),
        rating: Number(draft.rating) || 5,
        body: draft.body!.trim(),
        lang: (draft.lang ?? "ar") as "ar" | "en",
        is_active: draft.is_active ?? true,
        sort_order: Number(draft.sort_order) || 0,
      };
      if (editingId) {
        const { error } = await supabase.from("product_reviews").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_reviews").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
      resetDraft();
      qc.invalidateQueries({ queryKey: ["admin-product-reviews", selectedProduct] });
      qc.invalidateQueries({ queryKey: ["product-reviews", selectedProduct] });
    },
    onError: (e) => { console.error(e); toast.error(friendlyErrorMessage(e, lang)); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["admin-product-reviews", selectedProduct] });
      qc.invalidateQueries({ queryKey: ["product-reviews", selectedProduct] });
    },
    onError: (e) => { console.error(e); toast.error(friendlyErrorMessage(e, lang)); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("product_reviews")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-reviews", selectedProduct] });
      qc.invalidateQueries({ queryKey: ["product-reviews", selectedProduct] });
    },
    onError: (e) => { console.error(e); toast.error(friendlyErrorMessage(e, lang)); },
  });

  const selectedName = useMemo(() => {
    const p = products.data?.find((x: any) => x.id === selectedProduct);
    return p ? productLabel(p) : "";
  }, [products.data, selectedProduct]);

  return (
    <div className="space-y-6">
      <AdminHero
        icon={MessagesSquare}
        title="تقييمات الخدمات"
        subtitle="أضف وعدّل التقييمات الظاهرة لكل خدمة في تبويب التقييمات بصفحة المنتج"
      />

      <section className="p-4 sm:p-6 bg-card border border-border rounded-2xl">
        <label className="text-xs font-bold text-muted-foreground block mb-2">اختر الخدمة</label>
        <select
          value={selectedProduct}
          onChange={(e) => {
            setSelectedProduct(e.target.value);
            resetDraft();
          }}
          className="w-full px-3 py-2 bg-background border border-border rounded"
        >
          <option value="">، اختر خدمة ،</option>
          {products.data?.map((p: any) => (
            <option key={p.id} value={p.id}>
              {productLabel(p)}
            </option>
          ))}
        </select>
      </section>

      {selectedProduct && (
        <>
          <section className="p-4 sm:p-6 bg-card border border-border rounded-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{editingId ? "تعديل تقييم" : "إضافة تقييم"}</h2>
              {editingId && (
                <button
                  onClick={resetDraft}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"
                >
                  <X className="size-3" /> إلغاء
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">اسم المراجع</label>
                <input
                  value={draft.reviewer_name ?? ""}
                  onChange={(e) => setDraft({ ...draft, reviewer_name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                  placeholder="مثال: أحمد م."
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">التقييم (1-5)</label>
                <select
                  value={draft.rating ?? 5}
                  onChange={(e) => setDraft({ ...draft, rating: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} ★
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground">نص التقييم</label>
                <RichTextEditor
                  value={draft.body ?? ""}
                  onChange={(v) => setDraft({ ...draft, body: v })}
                  dir={(draft.lang ?? "ar") === "ar" ? "rtl" : "ltr"}
                  lang={(draft.lang ?? "ar") as "ar" | "en"}
                  minHeight={140}
                />

              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">اللغة</label>
                <select
                  value={draft.lang ?? "ar"}
                  onChange={(e) => setDraft({ ...draft, lang: e.target.value as "ar" | "en" })}
                  className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                >
                  <option value="ar">عربي</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">الترتيب</label>
                <input
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                />
              </div>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.is_active ?? true}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
                <span className="text-sm">مفعّل (ظاهر للعملاء)</span>
              </label>
            </div>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="px-5 py-2.5 bg-brand text-brand-foreground rounded-lg font-bold hover:brand-glow inline-flex items-center gap-2"
            >
              {editingId ? <Save className="size-4" /> : <Plus className="size-4" />}
              {save.isPending ? "جاري الحفظ..." : editingId ? "حفظ التعديل" : "إضافة"}
            </button>
          </section>

          <section className="p-4 sm:p-6 bg-card border border-border rounded-2xl">
            <h2 className="font-bold mb-4">
              تقييمات: {selectedName}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ({reviews.data?.length ?? 0})
              </span>
            </h2>
            {reviews.isLoading ? (
              <p className="text-sm text-muted-foreground">جاري التحميل...</p>
            ) : reviews.data && reviews.data.length > 0 ? (
              <div className="space-y-2">
                {reviews.data.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-border bg-background/40 flex flex-col sm:flex-row sm:items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-extrabold text-sm">{r.reviewer_name}</span>
                        <span className="text-warning text-xs tracking-widest">
                          {"★".repeat(r.rating)}
                          <span className="text-muted-foreground/40">
                            {"★".repeat(5 - r.rating)}
                          </span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                          {r.lang}
                        </span>
                        {!r.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                            مخفي
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed break-words">
                        {r.body}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.is_active}
                          onChange={(e) =>
                            toggleActive.mutate({ id: r.id, is_active: e.target.checked })
                          }
                        />
                        فعّال
                      </label>
                      <button
                        onClick={() => {
                          setEditingId(r.id);
                          setDraft({
                            reviewer_name: r.reviewer_name,
                            rating: r.rating,
                            body: r.body,
                            lang: r.lang,
                            is_active: r.is_active,
                            sort_order: r.sort_order,
                          });
                        }}
                        className="p-2 rounded-lg border border-border hover:bg-muted"
                        title="تعديل"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog({ message: "تأكيد الحذف؟", tone: "danger", confirmLabel: "احذف" });
                          if (ok) del.mutate(r.id);
                        }}
                        className="p-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
                        title="حذف"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                لسه مفيش تقييمات لهذه الخدمة. أضف واحد من فوق.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
