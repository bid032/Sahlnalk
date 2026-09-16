import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Check, X, FolderTree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { showError } from "@/lib/error-handler";
import { AdminHero } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: AdminCategories,
});

function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type EditState = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
};

function AdminCategories() {
  const { t, lang, confirm, notify } = useApp();
  const qc = useQueryClient();
  const [form, setForm] = useState({ slug: "", name_ar: "", name_en: "", sort_order: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);

  const cats = useQuery({
    queryKey: ["admin-cats-list"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      const slug = form.slug || slugify(form.name_en || form.name_ar);
      const { error } = await supabase.from("categories").insert({ ...form, slug, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cats-list"] });
      setForm({ slug: "", name_ar: "", name_en: "", sort_order: 0 });
      notify(lang === "ar" ? "تم إضافة القسم" : "Section added", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const toggle = useMutation({
    mutationFn: async (c: any) => {
      const { error } = await supabase.from("categories").update({ is_active: !c.is_active }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-cats-list"] }),
    onError: (e) => showError(e, notify, lang),
  });

  const save = useMutation({
    mutationFn: async (e: EditState) => {
      const slug = slugify(e.slug || e.name_en || e.name_ar);
      const { error } = await supabase
        .from("categories")
        .update({
          slug,
          name_ar: e.name_ar,
          name_en: e.name_en,
          sort_order: Number(e.sort_order) || 0,
        })
        .eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cats-list"] });
      setEdit(null);
      notify(lang === "ar" ? "تم الحفظ" : "Saved", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cats-list"] });
      notify(lang === "ar" ? "تم الحذف" : "Deleted", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const startEdit = (c: any) =>
    setEdit({
      id: c.id,
      slug: c.slug ?? "",
      name_ar: c.name_ar ?? "",
      name_en: c.name_en ?? "",
      sort_order: c.sort_order ?? 0,
    });

  const askDelete = async (c: any) => {
    const ok = await confirm({
      title: "حذف القسم",
      message: `متأكد إنك عاوز تمسح "${c.name_ar}"؟`,
      tone: "danger",
      confirmLabel: "احذف",
    });
    if (ok) del.mutate(c.id);
  };

  return (
    <div>
      <AdminHero
        icon={FolderTree}
        title={t.admin.categories}
        subtitle={
          lang === "ar"
            ? `${cats.data?.length ?? 0} قسم • نظّم خدمات المتجر`
            : `${cats.data?.length ?? 0} categories • organize your store`
        }
      />
      <div className="h-3 sm:h-4" />

      <form
        onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-6 p-4 bg-card border border-border rounded-2xl"
      >
        <input required placeholder="الاسم بالعربي" value={form.name_ar}
          onChange={(e) => {
            const name_ar = e.target.value;
            setForm((prev) => ({ ...prev, name_ar, slug: prev.slug || slugify(prev.name_en || name_ar) }));
          }}
          className="w-full min-w-0 px-3 py-2 bg-background border border-border rounded" />
        <input required placeholder="Name (English)" value={form.name_en}
          onChange={(e) => {
            const name_en = e.target.value;
            setForm((prev) => ({ ...prev, name_en, slug: slugify(name_en || prev.name_ar) }));
          }}
          className="w-full min-w-0 px-3 py-2 bg-background border border-border rounded" />
        <input placeholder="slug (تلقائي)" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
          className="w-full min-w-0 px-3 py-2 bg-background border border-border rounded font-mono text-sm" />
        <button type="submit" className="w-full px-3 py-2 bg-brand text-brand-foreground rounded font-bold">
          + {t.admin.addCategory}
        </button>
      </form>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-start">Slug</th>
              <th className="p-3 text-start">AR</th>
              <th className="p-3 text-start">EN</th>
              <th className="p-3 text-start">Sort</th>
              <th className="p-3 text-start">Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cats.data?.map((c) => {
              const isEditing = edit?.id === c.id;
              return (
                <tr key={c.id} className="border-t border-border align-middle">
                  <td className="p-3 font-mono text-xs">
                    {isEditing ? (
                      <input
                        value={edit!.slug}
                        onChange={(ev) => setEdit({ ...edit!, slug: slugify(ev.target.value) })}
                        className="w-full px-2 py-1 bg-background border border-border rounded font-mono text-xs"
                      />
                    ) : c.slug}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={edit!.name_ar}
                        onChange={(ev) => setEdit({ ...edit!, name_ar: ev.target.value })}
                        className="w-full px-2 py-1 bg-background border border-border rounded"
                      />
                    ) : c.name_ar}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={edit!.name_en}
                        onChange={(ev) => setEdit({ ...edit!, name_en: ev.target.value })}
                        className="w-full px-2 py-1 bg-background border border-border rounded"
                      />
                    ) : c.name_en}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="number"
                        value={edit!.sort_order}
                        onChange={(ev) => setEdit({ ...edit!, sort_order: Number(ev.target.value) })}
                        className="w-20 px-2 py-1 bg-background border border-border rounded"
                      />
                    ) : c.sort_order}
                  </td>
                  <td className="p-3">
                    <button onClick={() => toggle.mutate(c)}
                      className={`text-xs px-2 py-1 rounded ${c.is_active ? "bg-success/10 text-success" : "bg-muted"}`}>
                      {c.is_active ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="p-3 text-end whitespace-nowrap">
                    {isEditing ? (
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => save.mutate(edit!)}
                          disabled={save.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-success/10 text-success font-bold"
                        >
                          <Check className="size-3" /> حفظ
                        </button>
                        <button
                          onClick={() => setEdit(null)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted font-bold"
                        >
                          <X className="size-3" /> إلغاء
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-3">
                        <button
                          onClick={() => startEdit(c)}
                          className="inline-flex items-center gap-1 text-xs text-brand font-bold"
                        >
                          <Pencil className="size-3" /> تعديل
                        </button>
                        <button onClick={() => askDelete(c)} className="text-destructive text-xs font-bold">
                          حذف
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {cats.data?.map((c) => {
          const isEditing = edit?.id === c.id;
          return (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
              {isEditing ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">الاسم بالعربي</span>
                    <input
                      value={edit!.name_ar}
                      onChange={(ev) => setEdit({ ...edit!, name_ar: ev.target.value })}
                      className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Name (English)</span>
                    <input
                      value={edit!.name_en}
                      onChange={(ev) => setEdit({ ...edit!, name_en: ev.target.value })}
                      className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Slug</span>
                    <input
                      value={edit!.slug}
                      onChange={(ev) => setEdit({ ...edit!, slug: slugify(ev.target.value) })}
                      className="mt-1 w-full px-3 py-2 bg-background border border-border rounded font-mono text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Sort</span>
                    <input
                      type="number"
                      value={edit!.sort_order}
                      onChange={(ev) => setEdit({ ...edit!, sort_order: Number(ev.target.value) })}
                      className="mt-1 w-full px-3 py-2 bg-background border border-border rounded"
                    />
                  </label>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => save.mutate(edit!)}
                      disabled={save.isPending}
                      className="flex-1 px-3 py-2 bg-brand text-brand-foreground rounded font-bold text-sm"
                    >
                      حفظ
                    </button>
                    <button
                      onClick={() => setEdit(null)}
                      className="flex-1 px-3 py-2 bg-muted rounded font-bold text-sm"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.name_ar}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.name_en}</div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate mt-1">{c.slug}</div>
                    </div>
                    <button onClick={() => toggle.mutate(c)}
                      className={`shrink-0 text-xs px-2 py-1 rounded font-bold ${c.is_active ? "bg-success/10 text-success" : "bg-muted"}`}>
                      {c.is_active ? "ON" : "OFF"}
                    </button>
                  </div>
                  <div className="flex justify-end gap-4 pt-2 border-t border-border">
                    <button
                      onClick={() => startEdit(c)}
                      className="inline-flex items-center gap-1 text-brand text-xs font-bold"
                    >
                      <Pencil className="size-3" /> تعديل
                    </button>
                    <button onClick={() => askDelete(c)} className="text-destructive text-xs font-bold">
                      حذف
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {cats.data?.length === 0 && (
          <p className="text-center text-muted-foreground py-8">مفيش أقسام</p>
        )}
      </div>
    </div>
  );
}
