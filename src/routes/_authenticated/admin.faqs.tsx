import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, Plus, Save, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MarkdownContent } from "@/components/MarkdownContent";
import { AdminHero } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/faqs")({
  component: AdminFaqs,
});

type Faq = {
  id: string;
  question_ar: string;
  question_en: string;
  answer_ar: string;
  answer_en: string;
  sort_order: number;
  is_active: boolean;
};

function AdminFaqs() {
  const { notify, confirm } = useApp();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Faq[];
    },
  });

  const [draft, setDraft] = useState<Partial<Faq>>({
    question_ar: "",
    question_en: "",
    answer_ar: "",
    answer_en: "",
    sort_order: 0,
    is_active: true,
  });

  const create = async () => {
    if (!draft.question_ar || !draft.answer_ar) {
      notify("املأ السؤال والإجابة بالعربية", "error");
      return;
    }
    const { error } = await supabase.from("faqs").insert({
      question_ar: draft.question_ar,
      question_en: draft.question_en ?? "",
      answer_ar: draft.answer_ar,
      answer_en: draft.answer_en ?? "",
      sort_order: Number(draft.sort_order ?? 0),
      is_active: draft.is_active ?? true,
    });
    if (error) return notify(error.message, "error");
    notify("تمت الإضافة", "success");
    setDraft({ question_ar: "", question_en: "", answer_ar: "", answer_en: "", sort_order: 0, is_active: true });
    qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    qc.invalidateQueries({ queryKey: ["public-faqs"] });
  };

  const update = async (f: Faq) => {
    const { error } = await supabase.from("faqs").update({
      question_ar: f.question_ar,
      question_en: f.question_en,
      answer_ar: f.answer_ar,
      answer_en: f.answer_en,
      sort_order: f.sort_order,
      is_active: f.is_active,
    }).eq("id", f.id);
    if (error) return notify(error.message, "error");
    notify("تم الحفظ", "success");
    qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    qc.invalidateQueries({ queryKey: ["public-faqs"] });
  };

  const remove = async (id: string) => {
    const ok = await confirm({ message: "حذف هذا السؤال؟", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) return notify(error.message, "error");
    notify("تم الحذف", "success");
    qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    qc.invalidateQueries({ queryKey: ["public-faqs"] });
  };

  return (
    <div className="space-y-6">
      <AdminHero
        icon={HelpCircle}
        title="الأسئلة الشائعة"
        subtitle={`${list.data?.length ?? 0} سؤال • بتظهر في صفحة الأسئلة الشائعة`}
      />
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
        <h2 className="font-extrabold text-lg mb-4 flex items-center gap-2">
          <Plus className="size-5 text-brand" /> إضافة سؤال جديد
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="السؤال (عربي)"
            value={draft.question_ar ?? ""}
            onChange={(e) => setDraft({ ...draft, question_ar: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded-lg"
          />
          <input
            placeholder="Question (EN)"
            value={draft.question_en ?? ""}
            onChange={(e) => setDraft({ ...draft, question_en: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded-lg"
          />
          <div className="sm:col-span-2">
            <RichTextEditor
              value={draft.answer_ar ?? ""}
              onChange={(v) => setDraft({ ...draft, answer_ar: v })}
              dir="rtl"
              lang="ar"
              minHeight={140}
              placeholder="الإجابة (عربي)"
            />
          </div>
          <div className="sm:col-span-2">
            <RichTextEditor
              value={draft.answer_en ?? ""}
              onChange={(v) => setDraft({ ...draft, answer_en: v })}
              dir="ltr"
              lang="en"
              minHeight={140}
              placeholder="Answer (EN)"
            />
          </div>

          <input
            type="number"
            placeholder="ترتيب العرض"
            value={draft.sort_order ?? 0}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            className="px-3 py-2 bg-background border border-border rounded-lg"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active ?? true}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            نشط
          </label>
        </div>
        <button
          onClick={create}
          className="mt-4 px-5 py-2.5 bg-brand text-brand-foreground rounded-lg font-bold hover:brand-glow"
        >
          إضافة
        </button>
      </div>

      <div className="space-y-3">
        {list.isLoading && <p className="text-muted-foreground">جار التحميل...</p>}
        {list.data?.map((f) => (
          <FaqRow key={f.id} f={f} onSave={update} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}

function FaqRow({
  f,
  onSave,
  onDelete,
}: {
  f: Faq;
  onSave: (f: Faq) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState(f);
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={local.question_ar}
          onChange={(e) => setLocal({ ...local, question_ar: e.target.value })}
          className="px-3 py-2 bg-background border border-border rounded-lg font-bold"
        />
        <input
          value={local.question_en}
          onChange={(e) => setLocal({ ...local, question_en: e.target.value })}
          className="px-3 py-2 bg-background border border-border rounded-lg font-bold"
        />
        <div className="sm:col-span-2">
          <RichTextEditor
            value={local.answer_ar}
            onChange={(v) => setLocal({ ...local, answer_ar: v })}
            dir="rtl"
            lang="ar"
            minHeight={140}
          />
        </div>
        <div className="sm:col-span-2">
          <RichTextEditor
            value={local.answer_en}
            onChange={(v) => setLocal({ ...local, answer_en: v })}
            dir="ltr"
            lang="en"
            minHeight={140}
          />
        </div>

      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="number"
          value={local.sort_order}
          onChange={(e) => setLocal({ ...local, sort_order: Number(e.target.value) })}
          className="w-24 px-3 py-2 bg-background border border-border rounded-lg"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={local.is_active}
            onChange={(e) => setLocal({ ...local, is_active: e.target.checked })}
          />
          نشط
        </label>
        <button
          onClick={() => onSave(local)}
          className="ms-auto inline-flex items-center gap-1 px-4 py-2 bg-brand text-brand-foreground rounded-lg text-sm font-bold hover:brand-glow"
        >
          <Save className="size-4" /> حفظ
        </button>
        <button
          onClick={() => onDelete(f.id)}
          className="inline-flex items-center gap-1 px-3 py-2 border border-destructive/30 text-destructive rounded-lg text-sm font-bold hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> حذف
        </button>
      </div>
    </div>
  );
}
