import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Package, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { AdminHero, HeroAction } from "@/components/AdminHero";
import { SiteButton } from "@/components/ui/site-button";
import { ImageUpload } from "@/components/ImageUpload";
import { RichTextEditor } from "@/components/RichTextEditor";
import { showError } from "@/lib/error-handler";
import { matchesSearchQuery } from "@/lib/search-utils";

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(<>{children}</>, document.body);
}

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: AdminProducts,
});

type AccountType = "private" | "shared" | "both" | "own";

type ProductForm = {
  id?: string;
  slug: string;
  name_ar: string;
  name_en: string;
  short_description_ar: string;
  short_description_en: string;
  description_ar: string;
  description_en: string;
  icon_url: string;
  cover_url: string;
  loading_icon_url: string;
  category_id: string | null;
  category_ids: string[];
  delivery_type: "instant" | "manual";
  account_type: AccountType;
  account_types: AccountType[];
  status: "active" | "draft" | "archived";
  // is_featured: boolean;
  is_bestseller: boolean;
  discount_percent: number;
  plan_variants: string[];
  related_product_ids: string[];
};

const emptyForm: ProductForm = {
  slug: "",
  name_ar: "",
  name_en: "",
  short_description_ar: "",
  short_description_en: "",
  description_ar: "",
  description_en: "",
  icon_url: "",
  cover_url: "",
  loading_icon_url: "",
  category_id: null,
  category_ids: [],
  delivery_type: "instant",
  account_type: "shared",
  account_types: ["shared"],
  status: "active",
  // is_featured: false,
  is_bestseller: false,
  discount_percent: 0,
  plan_variants: [],
  related_product_ids: [],
};

/** Reduce a multi-select array into the legacy single account_type enum for backward compat. */
function deriveLegacyAccountType(types: AccountType[]): AccountType {
  const s = new Set(types);
  if (s.has("shared") && s.has("private")) return "both";
  if (s.has("both")) return "both";
  if (s.has("own")) return s.size === 1 ? "own" : "both";
  if (s.has("private")) return "private";
  if (s.has("shared")) return "shared";
  return "shared";
}

/** Turn any text into a URL-safe slug (English + Arabic). */
function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function AdminProducts() {
  const { t, lang, confirm, notify } = useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [planEditor, setPlanEditor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "archived">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const products = useQuery({
    queryKey: ["admin-products"],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, categories(name_ar, name_en), product_plans(id, label_ar, price, compare_price, stock, is_active)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const cats = useQuery({
    queryKey: ["admin-cats"],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () =>
      (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (f: ProductForm) => {
      const types = f.account_types.length > 0 ? f.account_types : ["shared" as const];
      const catIds = Array.from(new Set(f.category_ids.filter(Boolean)));
      const primary =
        f.category_id && catIds.includes(f.category_id) ? f.category_id : (catIds[0] ?? null);
      const cleanVariants = Array.from(
        new Set(f.plan_variants.map((v) => v.trim()).filter(Boolean)),
      );
      const cleanRelated = Array.from(new Set((f.related_product_ids || []).filter(Boolean)));
      const payload: any = {
        ...f,
        category_id: primary,
        category_ids: catIds,
        account_types: types,
        account_type: deriveLegacyAccountType(types),
        plan_variants: cleanVariants,
        related_product_ids: cleanRelated,
      };
      let { error, data } = f.id
        ? await supabase.from("products").update(payload).eq("id", f.id).select("id")
        : await supabase
          .from("products")
          .insert({ ...payload, id: undefined })
          .select("id");

      if (error && error.message?.includes("related_product_ids")) {
        delete payload.related_product_ids;
        const retry = f.id
          ? await supabase.from("products").update(payload).eq("id", f.id).select("id")
          : await supabase
            .from("products")
            .insert({ ...payload, id: undefined })
            .select("id");
        error = retry.error;
        data = retry.data;
        if (!error) {
          notify(
            lang === "ar"
              ? "تم حفظ المنتج. لحفظ المنتجات المشابهة، يُرجى تشغيل SQL في Supabase."
              : "Saved product. Run SQL migration in Supabase to persist related products.",
            "info",
          );
        }
      }

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          lang === "ar"
            ? "التعديل ما اتحفظش - حسابك مش أدمن. سجل دخول بحساب الأدمن."
            : "Save did not persist - your account is not admin.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setEditing(null);
      notify(lang === "ar" ? "تم الحفظ" : "Saved", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      notify(lang === "ar" ? "تم حذف المنتج" : "Product deleted", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  return (
    <div>
      <AdminHero
        icon={Package}
        title={t.admin.products}
        subtitle={
          lang === "ar"
            ? `${products.data?.length ?? 0} خدمة • إدارة الخدمات والأسعار`
            : `${products.data?.length ?? 0} products • manage services & prices`
        }
        actions={
          <HeroAction onClick={() => setEditing({ ...emptyForm })}>
            <Plus className="size-4" /> {t.admin.addProduct}
          </HeroAction>
        }
      />
      <div className="h-3 sm:h-4" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap gap-2 sm:gap-3 mb-4 items-stretch md:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الـ slug / Search…"
          className="w-full sm:col-span-2 md:flex-1 md:min-w-[220px] min-w-0 px-4 py-2 bg-card border border-border rounded-lg text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="w-full min-w-0 px-3 py-2 bg-card border border-border rounded-lg text-sm"
        >
          <option value="all">كل الحالات / All statuses</option>
          <option value="active">active</option>
          <option value="draft">draft</option>
          <option value="archived">archived</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full min-w-0 px-3 py-2 bg-card border border-border rounded-lg text-sm"
        >
          <option value="all">كل الأقسام / All categories</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_ar}
            </option>
          ))}
        </select>
        {(search || statusFilter !== "all" || categoryFilter !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setCategoryFilter("all");
            }}
            className="w-full sm:col-span-2 md:w-auto px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-lg md:border-0"
          >
            ✕ مسح
          </button>
        )}
      </div>

      {(() => {
        const filtered =
          products.data?.filter((p: any) => {
            if (statusFilter !== "all" && p.status !== statusFilter) return false;
            if (categoryFilter !== "all") {
              const list: string[] =
                Array.isArray(p.category_ids) && p.category_ids.length > 0
                  ? p.category_ids
                  : p.category_id
                    ? [p.category_id]
                    : [];
              if (!list.includes(categoryFilter)) return false;
            }
            if (search.trim()) {
              const hay = `${p.name_ar} ${p.name_en} ${p.short_description_ar ?? ""} ${p.short_description_en ?? ""} ${p.slug}`;
              if (!matchesSearchQuery(hay, search)) return false;
            }
            return true;
          }) ?? [];

        const openEdit = (p: any) => {
          const existing = ((p as any).account_types as AccountType[] | null) ?? [];
          const initTypes: AccountType[] =
            existing.length > 0
              ? existing
              : p.account_type === "both"
                ? ["shared", "private"]
                : [p.account_type as AccountType];
          const existingCats: string[] =
            Array.isArray((p as any).category_ids) && (p as any).category_ids.length > 0
              ? ((p as any).category_ids as string[])
              : p.category_id
                ? [p.category_id]
                : [];
          setEditing({
            id: p.id,
            slug: p.slug,
            name_ar: p.name_ar,
            name_en: p.name_en,
            short_description_ar: p.short_description_ar ?? "",
            short_description_en: p.short_description_en ?? "",
            description_ar: p.description_ar ?? "",
            description_en: p.description_en ?? "",
            icon_url: p.icon_url ?? "",
            cover_url: (p as any).cover_url ?? "",
            loading_icon_url: p.loading_icon_url ?? "",
            category_id: p.category_id,
            category_ids: existingCats,
            delivery_type: p.delivery_type,
            account_type: p.account_type,
            account_types: initTypes,
            status: p.status,
            is_bestseller: (p as any).is_bestseller ?? false,
            // status: p.status, is_featured: p.is_featured, is_bestseller: (p as any).is_bestseller ?? false,
            discount_percent: p.discount_percent ?? 0,
            plan_variants: Array.isArray((p as any).plan_variants)
              ? ((p as any).plan_variants as string[])
              : [],
            related_product_ids: Array.isArray((p as any).related_product_ids)
              ? ((p as any).related_product_ids as string[])
              : [],
          });
        };

        const askDelete = async (p: any) => {
          const ok = await confirm({
            title: "حذف الخدمة",
            message: `متأكد إنك عاوز تمسح "${p.name_ar}"؟ الإجراء ده مش هيرجع.`,
            tone: "danger",
            confirmLabel: "احذف",
          });
          if (ok) remove.mutate(p.id);
        };

        return (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card border border-border/60 rounded-2xl overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-muted">
                  <tr className="text-start text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="p-4 text-start">{t.admin.name}</th>
                    <th className="p-4 text-start">{t.admin.status}</th>
                    <th className="p-4 text-start">العروض والمخزون</th>
                    <th className="p-4 text-end">{t.admin.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => {
                    const totalStock = (p.product_plans ?? []).reduce(
                      (s: number, pl: any) => s + (pl.stock ?? 0),
                      0,
                    );
                    const plansCount = p.product_plans?.length ?? 0;
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="p-4">
                          <div className="font-bold">{p.name_ar}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.name_en} · {p.slug}
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-xs px-2 py-1 rounded ${p.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="p-4 text-sm">
                          <button
                            onClick={() => setPlanEditor(planEditor === p.id ? null : p.id)}
                            className="px-3 py-1.5 bg-brand/10 text-brand hover:bg-brand/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                            title="اضغط لتعديل الأسعار والمخزون"
                          >
                            <span>{plansCount} عرض</span>
                            <span className="text-muted-foreground">·</span>
                            <span
                              className={
                                totalStock === 0
                                  ? "text-destructive"
                                  : totalStock <= 10
                                    ? "text-warning"
                                    : "text-success"
                              }
                            >
                              {totalStock}
                            </span>
                          </button>
                        </td>
                        <td className="p-4 text-end">
                          <button
                            onClick={() => openEdit(p)}
                            className="text-brand text-sm hover:underline ms-3"
                          >
                            {t.admin.edit}
                          </button>
                          <button
                            onClick={() => askDelete(p)}
                            className="text-destructive text-sm hover:underline ms-3"
                          >
                            {t.admin.delete}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        No products yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((p: any) => {
                const totalStock = (p.product_plans ?? []).reduce(
                  (s: number, pl: any) => s + (pl.stock ?? 0),
                  0,
                );
                const plansCount = p.product_plans?.length ?? 0;
                return (
                  <div key={p.id} className="bg-card border border-border/60 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{p.name_ar}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.name_en}</div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                          {p.slug}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] px-2 py-1 rounded font-bold ${p.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <button
                      onClick={() => setPlanEditor(planEditor === p.id ? null : p.id)}
                      className="w-full mb-3 px-3 py-2 bg-brand/10 text-brand hover:bg-brand/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                    >
                      <span>{plansCount} عرض</span>
                      <span className="text-muted-foreground">·</span>
                      <span
                        className={
                          totalStock === 0
                            ? "text-destructive"
                            : totalStock <= 10
                              ? "text-warning"
                              : "text-success"
                        }
                      >
                        مخزون {totalStock}
                      </span>
                    </button>
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => openEdit(p)}
                        className="flex-1 px-3 py-2 bg-brand/10 text-brand rounded-lg text-xs font-bold"
                      >
                        {t.admin.edit}
                      </button>
                      <button
                        onClick={() => askDelete(p)}
                        className="flex-1 px-3 py-2 bg-destructive/10 text-destructive rounded-lg text-xs font-bold"
                      >
                        {t.admin.delete}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No products yet</p>
              )}
            </div>
          </>
        );
      })()}

      {planEditor && <PlanEditor productId={planEditor} onClose={() => setPlanEditor(null)} />}

      {editing && (
        <ModalPortal>
          <div
            className="fixed inset-x-0 bottom-0 z-[100] bg-background/80 backdrop-blur-md overflow-y-auto"
            style={{ top: "var(--app-header-h, 56px)" }}
          >
            <div className="min-h-full flex items-center justify-center p-2 sm:p-4 md:p-6">
              <div className="w-full max-w-[96vw] xl:max-w-[1400px] 2xl:max-w-[1600px] min-w-0 bg-card border border-border/60 rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden">
                {/* Modal cover header */}
                <div className="relative shrink-0 overflow-hidden bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] px-5 sm:px-8 py-4">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-extrabold text-white drop-shadow-md sm:text-xl">
                          {editing.id ? (
                            <span>
                              {t.admin.edit}:{" "}
                              <bdi>{editing.name_ar || editing.name_en || editing.slug}</bdi>
                            </span>
                          ) : (
                            t.admin.addProduct
                          )}
                        </h2>
                        <p className="mt-0.5 truncate text-[11px] text-white/85 drop-shadow sm:text-xs">
                          تفاصيل الخدمة، الوصف، الأقسام، وأنواع الحسابات المتاحة.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                      aria-label="close"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                <form
                  id="product-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate(editing);
                  }}
                  className="flex-1 min-h-0 overflow-y-auto"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 sm:gap-5 p-4 sm:p-6">
                    {/* Section navigator */}
                    <aside className="hidden lg:block">
                      <nav
                        aria-label="أقسام الخدمة"
                        className="sticky top-4 space-y-1 rounded-3xl border border-border/60 bg-card p-2.5 shadow-sm"
                      >
                        {[
                          { id: "sec-basic", n: "01", label: "الأساسية" },
                          { id: "sec-short", n: "02", label: "الوصف القصير" },
                          { id: "sec-desc", n: "03", label: "الوصف الكامل" },
                          { id: "sec-cats", n: "04", label: "الأقسام والحالة" },
                          { id: "sec-acct", n: "05", label: "الحسابات" },
                          { id: "sec-variants", n: "06", label: "الخطط" },
                          { id: "sec-related", n: "07", label: "المشابهة" },
                          { id: "sec-media", n: "08", label: "الميديا" },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(s.id)
                                ?.scrollIntoView({ behavior: "smooth", block: "start" })
                            }
                            className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-xs font-extrabold text-muted-foreground transition outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand/10 font-mono text-[10px] font-black text-brand">
                              {s.n}
                            </span>
                            {s.label}
                          </button>
                        ))}
                      </nav>
                    </aside>
                    {/* Main Section */}
                    <div className="min-w-0 space-y-4 sm:space-y-5">
                      {/* Basic Info */}
                      <div
                        id="sec-basic"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <span className="h-4 w-1 rounded-full bg-brand" />
                            المعلومات الأساسية
                          </h3>
                          <span className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground font-mono">
                            ID: {editing.id || "NEW"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Field label="الاسم بالعربي">
                            <input
                              required
                              placeholder="نتفليكس بريميوم"
                              value={editing.name_ar}
                              onChange={(e) => {
                                const name_ar = e.target.value;
                                setEditing(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      name_ar,
                                      slug:
                                        !prev.id && !prev.name_en ? slugify(name_ar) : prev.slug,
                                    },
                                );
                              }}
                              className="w-full h-11 px-3.5 bg-background border border-border/60 rounded-2xl font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm"
                            />
                          </Field>
                          <Field label="Name (English)">
                            <input
                              required
                              placeholder="Netflix Premium"
                              value={editing.name_en}
                              onChange={(e) => {
                                const name_en = e.target.value;
                                setEditing(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      name_en,
                                      slug: slugify(name_en),
                                    },
                                );
                              }}
                              className="w-full h-11 px-3.5 bg-background border border-border/60 rounded-2xl font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm"
                              dir="ltr"
                            />
                          </Field>
                          <Field label="الرابط (Slug)">
                            <input
                              required
                              placeholder="netflix-premium"
                              value={editing.slug}
                              onChange={(e) =>
                                setEditing({ ...editing, slug: slugify(e.target.value) })
                              }
                              className="w-full h-11 px-3.5 bg-background border border-border/60 rounded-2xl font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                              dir="ltr"
                            />
                          </Field>
                        </div>
                      </div>

                      {/* Short Descriptions */}
                      <div
                        id="sec-short"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <h3 className="flex items-center gap-2 text-sm font-extrabold">
                          <span className="h-4 w-1 rounded-full bg-brand" />
                          الوصف القصير (أعلى الصفحة)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Field label="الوصف القصير بالعربي">
                            <input
                              value={editing.short_description_ar}
                              onChange={(e) =>
                                setEditing({ ...editing, short_description_ar: e.target.value })
                              }
                              placeholder="وصف مختصر يظهر تحت اسم الخدمة..."
                              className="w-full h-11 px-3.5 bg-background border border-border/60 rounded-2xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </Field>
                          <Field label="Short Description (English)">
                            <input
                              value={editing.short_description_en}
                              onChange={(e) =>
                                setEditing({ ...editing, short_description_en: e.target.value })
                              }
                              placeholder="Short summary under service title..."
                              className="w-full h-11 px-3.5 bg-background border border-border/60 rounded-2xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                              dir="ltr"
                            />
                          </Field>
                        </div>
                      </div>

                      {/* Full Descriptions */}
                      <div
                        id="sec-desc"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <h3 className="flex items-center gap-2 text-sm font-extrabold">
                          <span className="h-4 w-1 rounded-full bg-brand" />
                          الوصف الكامل والتعليمات (Rich Text)
                        </h3>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                          <Field label="الوصف بالعربي">
                            <RichTextEditor
                              value={editing.description_ar}
                              onChange={(v) => setEditing({ ...editing, description_ar: v })}
                              placeholder="مواصفات الاشتراك، طرق التفعيل، والضمان..."
                              dir="rtl"
                              lang="ar"
                            />
                          </Field>
                          <Field label="Description (English)">
                            <RichTextEditor
                              value={editing.description_en}
                              onChange={(v) => setEditing({ ...editing, description_en: v })}
                              placeholder="Subscription features, terms, and warranty..."
                              dir="ltr"
                              lang="en"
                            />
                          </Field>
                        </div>
                      </div>

                      {/* Categories, Status, & Pricing Options */}
                      <div
                        id="sec-cats"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <h3 className="flex items-center gap-2 text-sm font-extrabold">
                          <span className="h-4 w-1 rounded-full bg-brand" />
                          الأقسام والحالة وإعدادات التقديم
                        </h3>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl border border-border/60 bg-card p-3.5 sm:p-4">
                            <Field
                              label={`الأقسام الممررة للخدمة${editing.category_ids.length ? ` • محدد ${editing.category_ids.length}` : ""}`}
                            >
                              <div className="grid grid-cols-2 gap-2">
                                {cats.data?.map((c) => {
                                  const active = editing.category_ids.includes(c.id);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        const set = new Set(editing.category_ids);
                                        if (set.has(c.id)) set.delete(c.id);
                                        else set.add(c.id);
                                        const next = Array.from(set);
                                        setEditing({
                                          ...editing,
                                          category_ids: next,
                                          category_id:
                                            editing.category_id &&
                                              next.includes(editing.category_id)
                                              ? editing.category_id
                                              : (next[0] ?? null),
                                        });
                                      }}
                                      className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold border transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background text-start flex items-center justify-between gap-2 ${active
                                          ? "border-transparent bg-brand text-white shadow-sm"
                                          : "border-border/60 bg-background/60 hover:border-brand/50 hover:text-brand"
                                        }`}
                                    >
                                      <span className="truncate">{c.name_ar}</span>
                                      {active && <Check className="size-3.5 shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </Field>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-2xl border border-border/60 bg-card p-3.5 sm:p-4">
                              <Field label="حالة الخدمة">
                                <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border/60 bg-background/60 p-1.5">
                                  {(
                                    [
                                      { v: "active", label: "ظاهر", dot: "bg-success" },
                                      { v: "draft", label: "مسودة", dot: "bg-warning" },
                                      { v: "archived", label: "مؤرشف", dot: "bg-muted-foreground" },
                                    ] as const
                                  ).map((o) => {
                                    const selected = editing.status === o.v;
                                    return (
                                      <button
                                        key={o.v}
                                        type="button"
                                        onClick={() =>
                                          setEditing({ ...editing, status: o.v as any })
                                        }
                                        className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-extrabold transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected
                                            ? "bg-brand text-white shadow-sm"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                          }`}
                                      >
                                        <span
                                          className={`size-1.5 rounded-full ${selected ? "bg-white" : o.dot}`}
                                        />
                                        {o.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </Field>
                            </div>
                            <div className="rounded-2xl border border-border/60 bg-card p-3.5 sm:p-4">
                              <Field label="نسبة الخصم العام (%)">
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={95}
                                    value={editing.discount_percent}
                                    onChange={(e) =>
                                      setEditing({
                                        ...editing,
                                        discount_percent: Math.max(
                                          0,
                                          Math.min(95, +e.target.value || 0),
                                        ),
                                      })
                                    }
                                    className="w-full h-11 px-3 bg-background border border-border/60 rounded-2xl font-black text-sm tabular-nums outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                                  />
                                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                                    %
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {[0, 5, 10, 15, 20, 25, 30, 50].map((v) => {
                                    const selected = Number(editing.discount_percent) === v;
                                    return (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() =>
                                          setEditing({ ...editing, discount_percent: v })
                                        }
                                        className={`rounded-full px-3 py-1 text-[11px] font-extrabold tabular-nums transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected
                                            ? "bg-brand text-white shadow-sm"
                                            : "border border-border/60 bg-background/60 text-muted-foreground hover:border-brand/50 hover:text-brand"
                                          }`}
                                      >
                                        {v}%
                                      </button>
                                    );
                                  })}
                                </div>
                              </Field>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Account Types */}
                      <div
                        id="sec-acct"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <h3 className="flex items-center gap-2 text-sm font-extrabold">
                          <span className="h-4 w-1 rounded-full bg-brand" />
                          أنواع الحسابات المتاحة
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {(
                            [
                              { v: "shared", label: "شير (مشترك)", desc: "بروفايل داخل حساب" },
                              {
                                v: "private",
                                label: "برايفت (خاص)",
                                desc: "حساب كامل باسم أو إيميل",
                              },
                              {
                                v: "own",
                                label: "من عندنا (على حسابك)",
                                desc: "تفعيل على حساب العميل",
                              },
                            ] as const
                          ).map((o) => {
                            const active = editing.account_types.includes(o.v as AccountType);
                            return (
                              <button
                                key={o.v}
                                type="button"
                                onClick={() => {
                                  const set = new Set(editing.account_types);
                                  if (set.has(o.v as AccountType)) set.delete(o.v as AccountType);
                                  else set.add(o.v as AccountType);
                                  setEditing({
                                    ...editing,
                                    account_types: Array.from(set) as AccountType[],
                                  });
                                }}
                                className={`relative p-3.5 rounded-2xl border-2 text-start transition outline-none active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background flex flex-col justify-between ${active
                                    ? "border-brand bg-brand/[0.06] shadow-sm"
                                    : "border-border/60 bg-card hover:border-brand/50"
                                  }`}
                              >
                                {active && (
                                  <span className="absolute top-2.5 end-2.5 grid size-5 place-items-center rounded-full bg-brand text-white shadow">
                                    <Check className="size-3" />
                                  </span>
                                )}
                                <div className="flex items-center justify-between w-full pe-7">
                                  <span className="font-extrabold text-xs">{o.label}</span>
                                </div>
                                <span className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                                  {o.desc}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Plan Variants */}
                      <div
                        id="sec-variants"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <span className="h-4 w-1 rounded-full bg-brand" />
                            أنواع الخطط (Plan Variants)
                          </h3>
                          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editing.plan_variants.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditing({
                                    ...editing,
                                    plan_variants: editing.plan_variants.length
                                      ? editing.plan_variants
                                      : [""],
                                  });
                                } else {
                                  setEditing({ ...editing, plan_variants: [] });
                                }
                              }}
                              className="accent-brand"
                            />
                            تفعيل الخطط متعددة الأنواع
                          </label>
                        </div>
                        {editing.plan_variants.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {editing.plan_variants.map((v, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  value={v}
                                  dir="ltr"
                                  placeholder={`Variant ${i + 1} - e.g. Premium Career / Sales Navigator`}
                                  onChange={(e) => {
                                    const next = [...editing.plan_variants];
                                    next[i] = e.target.value;
                                    setEditing({ ...editing, plan_variants: next });
                                  }}
                                  className="flex-1 h-10 px-3.5 bg-background border border-border/60 rounded-2xl text-sm font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                                />
                                <SiteButton
                                  variant="danger"
                                  size="sm"
                                  onClick={() =>
                                    setEditing({
                                      ...editing,
                                      plan_variants: editing.plan_variants.filter(
                                        (_, j) => j !== i,
                                      ),
                                    })
                                  }
                                >
                                  حذف
                                </SiteButton>
                              </div>
                            ))}
                            <SiteButton
                              variant="dashed"
                              size="sm"
                              onClick={() =>
                                setEditing({
                                  ...editing,
                                  plan_variants: [...editing.plan_variants, ""],
                                })
                              }
                              className="w-full"
                            >
                              + إضافة نوع خطة جديد
                            </SiteButton>
                          </div>
                        )}
                      </div>

                      {/* Related Products */}
                      <div
                        id="sec-related"
                        className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-background/50 shadow-sm space-y-4 scroll-mt-3"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <span className="h-4 w-1 rounded-full bg-brand" />
                            منتجات مشابهة (Related Products)
                          </h3>
                          {editing.related_product_ids.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setEditing({ ...editing, related_product_ids: [] })}
                              className="text-xs text-muted-foreground hover:text-destructive underline font-bold"
                            >
                              تفريغ المحدد ({editing.related_product_ids.length})
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          اختر الخدمات التي تريد عرضها في قسم "منتجات مشابهة" بصفحة هذا المنتج (تترك
                          فارغة للاختيار التلقائي).
                        </p>
                        <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 border border-border/60 rounded-2xl p-2.5 bg-background/60">
                          {products.data
                            ?.filter((p: any) => p.id !== editing.id && p.status === "active")
                            .map((p: any) => {
                              const selected = editing.related_product_ids.includes(p.id);
                              return (
                                <label
                                  key={p.id}
                                  className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl text-xs font-bold cursor-pointer transition ${selected
                                      ? "bg-brand/[0.06] border border-brand/50 text-brand shadow-sm"
                                      : "bg-card border border-border/60 hover:border-brand/40"
                                    }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(e) => {
                                        const set = new Set(editing.related_product_ids);
                                        if (e.target.checked) set.add(p.id);
                                        else set.delete(p.id);
                                        setEditing({
                                          ...editing,
                                          related_product_ids: Array.from(set),
                                        });
                                      }}
                                      className="accent-brand shrink-0"
                                    />
                                    <span className="truncate">{p.name_ar}</span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground truncate ms-2 font-mono">
                                    {p.name_en}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    {/* Media section */}
                    <section id="sec-media" className="scroll-mt-3 lg:col-span-2">
                      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-card shadow-sm space-y-4">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <span className="h-4 w-1 rounded-full bg-brand" />
                            صور وأيقونات الخدمة
                          </h3>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-foreground">
                                صورة / أيقونة الخدمة (1:1)
                              </label>
                              <ImageUpload
                                bucket="product-images"
                                label=""
                                compact
                                value={editing.icon_url}
                                onChange={(url) => setEditing({ ...editing, icon_url: url })}
                                size={0}
                                requireAspectRatio={{ w: 1, h: 1 }}
                              />
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                أيقونة الخدمة في صفحة التفاصيل (وبتظهر في الكارت لو مفيش غلاف).
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-foreground">
                                صورة غلاف الكارت (16:9)
                              </label>
                              <ImageUpload
                                bucket="product-images"
                                label=""
                                compact
                                value={editing.cover_url}
                                onChange={(url) => setEditing({ ...editing, cover_url: url })}
                                size={0}
                                requireAspectRatio={{ w: 16, h: 9 }}
                              />
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                تظهر أعلى كارت الخدمة فقط (لو فاضية هيظهر التصميم الافتراضي).
                              </p>
                            </div>
                            <div className="pt-3 border-t border-border space-y-1.5">
                              <label className="text-xs font-bold text-foreground">
                                أيقونة التحميل (Loading Icon)
                              </label>
                              <ImageUpload
                                bucket="product-images"
                                label=""
                                compact
                                value={editing.loading_icon_url}
                                onChange={(url) =>
                                  setEditing({ ...editing, loading_icon_url: url })
                                }
                                size={0}
                                requireAspectRatio={{ w: 1, h: 1 }}
                              />
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                أيقونة تظهر أثناء التحميل (اختياري).
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 sm:p-5 rounded-3xl border border-border/60 bg-card shadow-sm space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <span className="h-4 w-1 rounded-full bg-brand" />
                            الوسوم والتمييز
                          </h3>
                          <label className="flex items-center justify-between gap-3 text-xs p-3 bg-background border border-border rounded-xl cursor-pointer hover:border-brand/40 transition">
                            <span className="font-bold">شارة الأحدث والأكثر مبيعاً</span>
                            <input
                              type="checkbox"
                              checked={editing.is_bestseller}
                              onChange={(e) =>
                                setEditing({ ...editing, is_bestseller: e.target.checked })
                              }
                              className="accent-brand size-4"
                            />
                          </label>
                        </div>
                      </div>
                    </section>
                  </div>
                </form>

                {/* Fixed Action Footer */}
                <div className="px-5 sm:px-8 py-4 border-t border-border/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 bg-card/95 backdrop-blur">
                  <p className="text-xs text-muted-foreground order-2 sm:order-1 leading-relaxed">
                    💡 <span className="text-warning font-bold">ملاحظة:</span> يتم التحكم في أسعار
                    الخطط والمخزون من زر <span className="text-brand font-bold">"Plans"</span> بعد
                    حفظ الخدمة.
                  </p>
                  <div className="flex items-center gap-2.5 order-1 sm:order-2 justify-end">
                    <SiteButton variant="outline" onClick={() => setEditing(null)}>
                      {t.admin.cancel}
                    </SiteButton>
                    <SiteButton
                      variant="primary"
                      type="submit"
                      form="product-edit-form"
                      disabled={save.isPending}
                    >
                      {save.isPending ? t.common.loading : t.admin.save}
                    </SiteButton>
                  </div>
                </div>
                {save.error && (
                  <p className="px-8 pb-3 text-destructive text-xs font-bold">
                    {(save.error as Error).message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-extrabold">{label}</label>
      {hint && <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function PlanEditor({ productId, onClose }: { productId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { lang, confirm, notify } = useApp();
  const productMeta = useQuery({
    queryKey: ["plan-editor-product", productId],
    queryFn: async () =>
      (
        await supabase
          .from("products")
          .select("account_types, account_type, plan_variants")
          .eq("id", productId)
          .maybeSingle()
      ).data,
  });
  const acctTypes: ("private" | "shared" | "own")[] = (() => {
    const arr = (productMeta.data as any)?.account_types as string[] | null;
    const legacy = (productMeta.data as any)?.account_type as string | null;
    let types: string[] =
      Array.isArray(arr) && arr.length > 0
        ? arr
        : legacy === "both"
          ? ["private", "shared"]
          : legacy
            ? [legacy]
            : [];
    return types.filter((a) => a === "private" || a === "shared" || a === "own") as any;
  })();
  const showAcctPicker = acctTypes.length > 1;
  const variantOptions: string[] = Array.isArray((productMeta.data as any)?.plan_variants)
    ? ((productMeta.data as any).plan_variants as string[]).filter(Boolean)
    : [];
  const showVariantPicker = variantOptions.length > 0;
  const acctLabel = (a: string) =>
    a === "private" ? "خاص" : a === "shared" ? "مشترك" : a === "own" ? "من عندك" : "الكل";
  const plans = useQuery({
    queryKey: ["plans", productId],
    queryFn: async () =>
      (
        await supabase
          .from("product_plans")
          .select(
            "id, product_id, label_ar, label_en, duration_days, price, compare_price, stock, is_active, sort_order, sheet_csv_url, account_type, plan_variant",
          )
          .eq("product_id", productId)
          .order("duration_days")
      ).data ?? [],
  });

  const costs = useQuery({
    queryKey: ["plan-costs", productId],
    enabled: !!plans.data,
    queryFn: async () => {
      const ids = (plans.data ?? []).map((p: any) => p.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("plan_costs")
        .select("plan_id, cost_price")
        .in("plan_id", ids);
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        m[r.plan_id] = Number(r.cost_price ?? 0);
      });
      return m;
    },
  });

  const [form, setForm] = useState({
    label_ar: "",
    label_en: "",
    duration_months: 1,
    price: 0,
    compare_price: 0,
    cost_price: 0,
    stock: 0,
    account_type: "" as "" | "private" | "shared" | "own",
    plan_variant: "" as string,
  });

  // Local edits map keyed by plan id , apply on save
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        label_ar?: string;
        label_en?: string;
        duration_days?: number;
        price?: number;
        compare_price?: number | null;
        stock?: number;
        cost_price?: number;
        account_type?: "private" | "shared" | "own" | null;
        plan_variant?: string | null;
      }
    >
  >({});

  const patch = (id: string, k: string, v: any) =>
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }));

  const add = useMutation({
    mutationFn: async () => {
      const payload: any = {
        product_id: productId,
        label_ar: form.label_ar,
        label_en: form.label_en,
        duration_days: Math.max(1, form.duration_months) * 30,
        price: form.price,
        compare_price: form.compare_price > 0 ? form.compare_price : null,
        stock: form.stock,
        is_active: true,
        account_type: form.account_type || null,
        plan_variant: form.plan_variant || null,
      };
      const { data: inserted, error } = await supabase
        .from("product_plans")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      if (form.cost_price > 0 && inserted) {
        await supabase
          .from("plan_costs")
          .upsert({ plan_id: inserted.id, cost_price: form.cost_price });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans", productId] });
      qc.invalidateQueries({ queryKey: ["plan-costs", productId] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setForm({
        label_ar: "",
        label_en: "",
        duration_months: 1,
        price: 0,
        compare_price: 0,
        cost_price: 0,
        stock: 0,
        account_type: "",
        plan_variant: "",
      });
      notify(lang === "ar" ? "تم إضافة العرض" : "Plan added", "success");
    },

    onError: (e) => showError(e, notify, lang),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      const ids = Object.keys(edits);
      for (const id of ids) {
        const patchData = edits[id];
        if (!patchData) continue;
        const clean: any = {};
        if (patchData.label_ar !== undefined) clean.label_ar = patchData.label_ar;
        if (patchData.label_en !== undefined) clean.label_en = patchData.label_en;
        if (patchData.duration_days !== undefined) clean.duration_days = patchData.duration_days;
        if (patchData.price !== undefined) clean.price = patchData.price;
        if (patchData.compare_price !== undefined) clean.compare_price = patchData.compare_price;
        if (patchData.stock !== undefined) clean.stock = patchData.stock;
        if (patchData.account_type !== undefined) clean.account_type = patchData.account_type;
        if (patchData.plan_variant !== undefined) clean.plan_variant = patchData.plan_variant;
        if (Object.keys(clean).length > 0) {
          const { error } = await supabase.from("product_plans").update(clean).eq("id", id);
          if (error) throw error;
        }
        if (patchData.cost_price !== undefined) {
          const { error } = await supabase
            .from("plan_costs")
            .upsert({ plan_id: id, cost_price: patchData.cost_price });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans", productId] });
      qc.invalidateQueries({ queryKey: ["plan-costs", productId] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setEdits({});
      notify(lang === "ar" ? "تم حفظ التعديلات" : "Changes saved", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans", productId] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      notify(lang === "ar" ? "تم مسح العرض" : "Plan deleted", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const dirtyCount = Object.keys(edits).length;

  const [showAdd, setShowAdd] = useState(false);

  return (
    <ModalPortal>
      <div
        className="fixed inset-x-0 bottom-0 z-[100] bg-background/80 backdrop-blur flex items-center justify-center p-2 sm:p-4 md:p-6"
        style={{ top: "var(--app-header-h, 56px)" }}
      >
        <div className="w-full max-w-[min(98vw,1500px)] h-full bg-card border border-border/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          {/* Cover header */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] px-4 sm:px-6 py-3.5 sm:py-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15 text-lg text-white backdrop-blur-md border border-white/25">
                  💼
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-white drop-shadow-md sm:text-lg">
                    العروض والأسعار والمخزون
                  </h3>
                  <p className="truncate text-[11px] text-white/85 drop-shadow sm:text-xs">
                    كل صف = عرض بمدة وسعر ومخزون. <b>سعر الشراء</b> بيظهرلك أنت بس لحساب الربح.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SiteButton
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdd((s) => !s)}
                  className="hidden border-white/25 bg-white/15 text-white backdrop-blur-md hover:border-white/50 hover:bg-white/25 hover:text-white sm:inline-flex"
                >
                  <Plus className="size-4" />
                  إضافة عرض
                </SiteButton>
                <button
                  onClick={onClose}
                  aria-label="close"
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Scroll area */}
          <div className="flex-1 overflow-y-auto">
            {/* Collapsible Add form */}
            {showAdd && (
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  add.mutate();
                }}
                className="border-b border-border/60 bg-background/40 p-3 sm:p-4"
              >
                <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="flex items-center gap-2 text-sm font-extrabold">
                      <span className="grid size-6 place-items-center rounded-full bg-gradient-to-l from-[#0b3fa0] to-[#00a9e0] text-white shadow-sm">
                        <Plus className="size-3.5" />
                      </span>
                      إضافة عرض جديد
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAdd(false)}
                      className="text-xs font-bold text-muted-foreground transition hover:text-foreground"
                    >
                      إخفاء
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 min-w-0">
                    <Field label="عربي">
                      <input
                        required
                        value={form.label_ar}
                        onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <Field label="English">
                      <input
                        required
                        value={form.label_en}
                        onChange={(e) => setForm({ ...form, label_en: e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <Field label="شهور">
                      <input
                        type="number"
                        min={1}
                        value={form.duration_months}
                        onChange={(e) => setForm({ ...form, duration_months: +e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <Field label="سعر البيع">
                      <input
                        type="number"
                        required
                        min={0}
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: +e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm font-bold tabular-nums outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <Field label="قبل الخصم">
                      <input
                        type="number"
                        min={0}
                        value={form.compare_price}
                        onChange={(e) => setForm({ ...form, compare_price: +e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <Field label="سعر الشراء">
                      <input
                        type="number"
                        min={0}
                        value={form.cost_price}
                        onChange={(e) => setForm({ ...form, cost_price: +e.target.value })}
                        className="w-full px-2.5 py-2 bg-warning/[0.04] border border-warning/30 rounded-xl text-sm outline-none transition focus:border-warning focus:ring-2 focus:ring-warning/20"
                      />
                    </Field>
                    <Field label="المخزون">
                      <input
                        type="number"
                        min={0}
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: +e.target.value })}
                        className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </Field>
                    <div className="flex flex-col justify-end">
                      <SiteButton
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={add.isPending}
                        className="w-full py-2.5"
                      >
                        <Plus className="size-4" />
                        {add.isPending ? "..." : "إضافة"}
                      </SiteButton>
                    </div>
                    {(showAcctPicker || showVariantPicker) && (
                      <div className="col-span-2 md:col-span-4 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-2.5 rounded-2xl border border-border/60 bg-background/60 p-3">
                        {showAcctPicker && (
                          <Field label="نوع الحساب">
                            <select
                              value={form.account_type}
                              onChange={(e) =>
                                setForm({ ...form, account_type: e.target.value as any })
                              }
                              className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            >
                              <option value="">-لكل الأنواع -</option>
                              {acctTypes.map((a) => (
                                <option key={a} value={a}>
                                  {acctLabel(a)}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {showVariantPicker && (
                          <Field label="نوع الخطة">
                            <select
                              value={form.plan_variant}
                              onChange={(e) => setForm({ ...form, plan_variant: e.target.value })}
                              className="w-full px-2.5 py-2 bg-background border border-border/60 rounded-xl text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            >
                              <option value="">-بدون تحديد -</option>
                              {variantOptions.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </form>
            )}

            {/* Empty state */}
            {plans.data?.length === 0 && (
              <div className="m-3 sm:m-4 rounded-3xl border border-dashed border-border/70 bg-card px-4 py-10 text-center sm:py-12">
                <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Plus className="size-5" />
                </span>
                <p className="mt-3 text-sm font-extrabold">مفيش عروض لسه</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  دوس «إضافة عرض» فوق عشان تضيف أول خطة.
                </p>
              </div>
            )}

            {/* Table (desktop) */}
            {(plans.data?.length ?? 0) > 0 && (
              <div className="hidden lg:block m-3 sm:m-4 overflow-hidden rounded-2xl border border-border/60">
                <table className="w-full text-sm border-separate border-spacing-0 bg-card">
                  <thead className="sticky top-0 z-10 bg-background backdrop-blur">
                    <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">
                      <th className="text-start px-3 py-2 border-b border-border">العرض</th>
                      <th className="text-start px-2 py-2 border-b border-border">المدة</th>
                      {showAcctPicker && (
                        <th className="text-start px-2 py-2 border-b border-border">نوع الحساب</th>
                      )}
                      {showVariantPicker && (
                        <th className="text-start px-2 py-2 border-b border-border">نوع الخطة</th>
                      )}
                      <th className="text-start px-2 py-2 border-b border-border">سعر البيع</th>
                      <th className="text-start px-2 py-2 border-b border-border">قبل الخصم</th>
                      <th className="text-start px-2 py-2 border-b border-border text-warning">
                        سعر الشراء
                      </th>
                      <th className="text-start px-2 py-2 border-b border-border">المخزون</th>
                      <th className="text-start px-2 py-2 border-b border-border">الربح</th>
                      <th className="text-start px-2 py-2 border-b border-border">الحالة</th>
                      <th className="text-center px-2 py-2 border-b border-border w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.data?.map((p: any) => {
                      const e = edits[p.id] ?? {};
                      const price = e.price ?? p.price;
                      const compare =
                        e.compare_price !== undefined ? e.compare_price : p.compare_price;
                      const stock = e.stock ?? p.stock;
                      const cost =
                        e.cost_price !== undefined ? e.cost_price : (costs.data?.[p.id] ?? 0);
                      const dirty = !!edits[p.id];
                      const labelAr = e.label_ar !== undefined ? e.label_ar : (p.label_ar ?? "");
                      const labelEn = e.label_en !== undefined ? e.label_en : (p.label_en ?? "");
                      const months = Math.max(
                        1,
                        Math.round((e.duration_days ?? p.duration_days ?? 30) / 30),
                      );
                      const margin = Number(price) - Number(cost);
                      const currentAcct =
                        (e.account_type !== undefined ? e.account_type : p.account_type) ?? "";
                      const currentVariant =
                        (e.plan_variant !== undefined ? e.plan_variant : p.plan_variant) ?? "";
                      return (
                        <tr
                          key={p.id}
                          className={`transition ${dirty ? "bg-brand/5" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-3 py-2 border-b border-border/60 relative">
                            {dirty && (
                              <span className="absolute inset-y-0 start-0 w-1 bg-brand rounded-e" />
                            )}
                            <input
                              value={labelAr}
                              onChange={(ev) => patch(p.id, "label_ar", ev.target.value)}
                              className="w-full min-w-[150px] px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-black outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                            <input
                              value={labelEn}
                              dir="ltr"
                              onChange={(ev) => patch(p.id, "label_en", ev.target.value)}
                              className="mt-1 w-full min-w-[150px] px-2 py-1 bg-card border border-border/60 rounded-lg text-[11px] text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                value={months}
                                onChange={(ev) =>
                                  patch(
                                    p.id,
                                    "duration_days",
                                    Math.max(1, +ev.target.value || 1) * 30,
                                  )
                                }
                                className="w-16 px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                              />
                              <span className="text-[11px] text-muted-foreground">شهر</span>
                            </div>
                          </td>
                          {showAcctPicker && (
                            <td className="px-2 py-2 border-b border-border/60">
                              <select
                                value={currentAcct}
                                onChange={(ev) =>
                                  patch(
                                    p.id,
                                    "account_type",
                                    ev.target.value === "" ? null : ev.target.value,
                                  )
                                }
                                className="w-full min-w-[110px] px-2 py-1 bg-card border border-border/60 rounded-lg text-xs font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                              >
                                <option value="">-الكل -</option>
                                {acctTypes.map((a) => (
                                  <option key={a} value={a}>
                                    {acctLabel(a)}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          {showVariantPicker && (
                            <td className="px-2 py-2 border-b border-border/60">
                              <select
                                value={currentVariant}
                                onChange={(ev) =>
                                  patch(
                                    p.id,
                                    "plan_variant",
                                    ev.target.value === "" ? null : ev.target.value,
                                  )
                                }
                                className="w-full min-w-[130px] px-2 py-1 bg-card border border-border/60 rounded-lg text-xs font-bold outline-none transition focus:border-warning focus:ring-2 focus:ring-warning/20"
                              >
                                <option value="">-بدون -</option>
                                {variantOptions.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td className="px-2 py-2 border-b border-border/60">
                            <input
                              type="number"
                              min={0}
                              value={price ?? 0}
                              onChange={(ev) => patch(p.id, "price", +ev.target.value)}
                              className="w-24 px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            <input
                              type="number"
                              min={0}
                              placeholder="-"
                              value={compare ?? ""}
                              onChange={(ev) =>
                                patch(
                                  p.id,
                                  "compare_price",
                                  ev.target.value === "" ? null : +ev.target.value,
                                )
                              }
                              className="w-24 px-2 py-1 bg-card border border-border/60 rounded-lg text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            <input
                              type="number"
                              min={0}
                              value={cost ?? 0}
                              onChange={(ev) => patch(p.id, "cost_price", +ev.target.value)}
                              className="w-24 px-2 py-1 bg-warning/5 border border-warning/30 rounded text-sm font-bold outline-none transition focus:border-warning focus:ring-2 focus:ring-warning/20"
                            />
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            <input
                              type="number"
                              min={0}
                              value={stock ?? 0}
                              onChange={(ev) => patch(p.id, "stock", +ev.target.value)}
                              className="w-20 px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-bold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-black whitespace-nowrap ${margin > 0 ? "bg-success/10 text-success" : margin < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                            >
                              {margin} EGP
                            </span>
                          </td>
                          <td className="px-2 py-2 border-b border-border/60">
                            {stock === 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-bold">
                                نفذ
                              </span>
                            ) : stock <= 10 ? (
                              <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-bold">
                                قليل
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold">
                                متاح
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 border-b border-border/60 text-center">
                            <button
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "حذف العرض",
                                  message: `مسح عرض "${p.label_ar}"؟`,
                                  tone: "danger",
                                  confirmLabel: "احذف",
                                });
                                if (ok) del.mutate(p.id);
                              }}
                              className="grid size-8 place-items-center rounded-full text-destructive transition hover:bg-destructive/10 active:scale-90"
                              title="مسح"
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cards (mobile / tablet) */}
            {(plans.data?.length ?? 0) > 0 && (
              <div className="lg:hidden p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {plans.data?.map((p: any) => {
                  const e = edits[p.id] ?? {};
                  const price = e.price ?? p.price;
                  const compare = e.compare_price !== undefined ? e.compare_price : p.compare_price;
                  const stock = e.stock ?? p.stock;
                  const cost =
                    e.cost_price !== undefined ? e.cost_price : (costs.data?.[p.id] ?? 0);
                  const dirty = !!edits[p.id];
                  const labelAr = e.label_ar !== undefined ? e.label_ar : (p.label_ar ?? "");
                  const labelEn = e.label_en !== undefined ? e.label_en : (p.label_en ?? "");
                  const months = Math.max(
                    1,
                    Math.round((e.duration_days ?? p.duration_days ?? 30) / 30),
                  );
                  const margin = Number(price) - Number(cost);
                  const currentAcct =
                    (e.account_type !== undefined ? e.account_type : p.account_type) ?? "";
                  const currentVariant =
                    (e.plan_variant !== undefined ? e.plan_variant : p.plan_variant) ?? "";
                  return (
                    <div
                      key={p.id}
                      className={`p-4 bg-card rounded-3xl border-2 shadow-sm transition ${dirty ? "border-brand/60" : "border-border/60"}`}
                    >
                      <div className="flex justify-between items-start mb-2 pb-2 border-b border-border gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            value={labelAr}
                            onChange={(ev) => patch(p.id, "label_ar", ev.target.value)}
                            className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-black"
                          />
                          <input
                            value={labelEn}
                            dir="ltr"
                            onChange={(ev) => patch(p.id, "label_en", ev.target.value)}
                            className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-[11px]"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={months}
                              onChange={(ev) =>
                                patch(
                                  p.id,
                                  "duration_days",
                                  Math.max(1, +ev.target.value || 1) * 30,
                                )
                              }
                              className="w-16 px-2 py-1 bg-card border border-border/60 rounded-lg text-xs font-bold"
                            />
                            <span className="text-[10px] text-muted-foreground">شهر</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.account_type && (
                              <span className="px-1.5 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold">
                                {acctLabel(p.account_type)}
                              </span>
                            )}
                            {p.plan_variant && (
                              <span className="px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-bold">
                                {p.plan_variant}
                              </span>
                            )}
                            {dirty && (
                              <span className="px-1.5 py-0.5 rounded-full bg-brand text-brand-foreground text-[10px] font-bold">
                                معدّل
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: "حذف العرض",
                              message: `مسح "${p.label_ar}"؟`,
                              tone: "danger",
                              confirmLabel: "احذف",
                            });
                            if (ok) del.mutate(p.id);
                          }}
                          className="grid size-8 shrink-0 place-items-center rounded-full text-destructive transition hover:bg-destructive/10 active:scale-90"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      {(showAcctPicker || showVariantPicker) && (
                        <div
                          className={`grid gap-2 mb-2 ${showAcctPicker && showVariantPicker ? "grid-cols-2" : "grid-cols-1"}`}
                        >
                          {showAcctPicker && (
                            <select
                              value={currentAcct}
                              onChange={(ev) =>
                                patch(
                                  p.id,
                                  "account_type",
                                  ev.target.value === "" ? null : ev.target.value,
                                )
                              }
                              className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-xs font-bold"
                            >
                              <option value="">نوع الحساب -الكل</option>
                              {acctTypes.map((a) => (
                                <option key={a} value={a}>
                                  {acctLabel(a)}
                                </option>
                              ))}
                            </select>
                          )}
                          {showVariantPicker && (
                            <select
                              value={currentVariant}
                              onChange={(ev) =>
                                patch(
                                  p.id,
                                  "plan_variant",
                                  ev.target.value === "" ? null : ev.target.value,
                                )
                              }
                              className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-xs font-bold"
                            >
                              <option value="">نوع الخطة -بدون</option>
                              {variantOptions.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-black text-muted-foreground uppercase">
                            سعر البيع
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={price ?? 0}
                            onChange={(ev) => patch(p.id, "price", +ev.target.value)}
                            className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-bold"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black text-muted-foreground uppercase">
                            قبل الخصم
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="-"
                            value={compare ?? ""}
                            onChange={(ev) =>
                              patch(
                                p.id,
                                "compare_price",
                                ev.target.value === "" ? null : +ev.target.value,
                              )
                            }
                            className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black text-warning uppercase">
                            سعر الشراء
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={cost ?? 0}
                            onChange={(ev) => patch(p.id, "cost_price", +ev.target.value)}
                            className="w-full px-2 py-1 bg-warning/5 border border-warning/30 rounded text-sm font-bold"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black text-muted-foreground uppercase">
                            المخزون
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={stock ?? 0}
                            onChange={(ev) => patch(p.id, "stock", +ev.target.value)}
                            className="w-full px-2 py-1 bg-card border border-border/60 rounded-lg text-sm font-bold"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-xs flex-wrap">
                        {stock === 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold">
                            نفذ
                          </span>
                        ) : stock <= 10 ? (
                          <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning font-bold">
                            قليل
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-success/10 text-success font-bold">
                            متاح
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${margin > 0 ? "bg-success/10 text-success" : margin < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                        >
                          ربح: {margin} EGP
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="border-t border-border bg-card/95 backdrop-blur px-3 sm:px-5 py-3 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 text-xs sm:text-sm min-w-0">
              <span className="text-muted-foreground whitespace-nowrap">
                {plans.data?.length ?? 0} عرض
              </span>
              {dirtyCount > 0 ? (
                <span className="font-black text-brand truncate">
                  • {dirtyCount} تعديل غير محفوظ
                </span>
              ) : (
                <span className="text-muted-foreground truncate">• كل التعديلات محفوظة</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SiteButton
                variant="primary"
                size="sm"
                onClick={() => setShowAdd((s) => !s)}
                className="sm:hidden"
              >
                <Plus className="size-4" />
              </SiteButton>
              <SiteButton
                variant="ghost"
                size="sm"
                onClick={() => setEdits({})}
                disabled={dirtyCount === 0 || saveAll.isPending}
              >
                إلغاء
              </SiteButton>
              <SiteButton
                variant="primary"
                size="sm"
                onClick={() => saveAll.mutate()}
                disabled={dirtyCount === 0 || saveAll.isPending}
                className="px-5"
              >
                {saveAll.isPending
                  ? "جاري الحفظ..."
                  : `حفظ الكل${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </SiteButton>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
