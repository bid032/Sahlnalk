import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, TestTube2, Power, PowerOff, Search, Plug,
  CheckCircle2, XCircle, Copy, ChevronLeft, ChevronRight, X, Save,
} from "lucide-react";
import { AdminHero, HeroAction } from "@/components/AdminHero";
import { useApp } from "@/contexts/AppContext";
import {
  listGoogleSheetIntegrations,
  createGoogleSheetIntegration,
  updateGoogleSheetIntegration,
  deleteGoogleSheetIntegration,
  testGoogleSheetIntegration,
} from "@/lib/google-sheet-integrations.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/integrations")({
  component: IntegrationsPage,
});

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  spreadsheet_id: string;
  worksheet_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const PAGE_SIZE = 10;

function IntegrationsPage() {
  const { notify } = useApp();
  const qc = useQueryClient();

  const listFn = useServerFn(listGoogleSheetIntegrations);
  const createFn = useServerFn(createGoogleSheetIntegration);
  const updateFn = useServerFn(updateGoogleSheetIntegration);
  const deleteFn = useServerFn(deleteGoogleSheetIntegration);
  const testFn = useServerFn(testGoogleSheetIntegration);

  const q = useQuery({
    queryKey: ["gsi-list"],
    queryFn: async () => (await listFn()).rows as Row[],
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; res: any } | null>(null);

  const rows = q.data ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.slug.toLowerCase().includes(s) ||
        (r.description ?? "").toLowerCase().includes(s) ||
        r.spreadsheet_id.toLowerCase().includes(s) ||
        r.worksheet_name.toLowerCase().includes(s),
    );
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gsi-list"] });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateFn({ data: { id, enabled } }),
    onSuccess: () => {
      invalidate();
      notify("تم التحديث", "success");
    },
    onError: (e: any) => notify(e?.message ?? "فشل التحديث", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      notify("تم الحذف", "success");
    },
    onError: (e: any) => notify(e?.message ?? "فشل الحذف", "error"),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => testFn({ data: { id } }),
    onSuccess: (res: any, id) => {
      setTestResult({ id, res });
      if (res?.ok) notify("الاتصال ناجح ✅", "success");
      else notify(res?.error ?? "فشل الاختبار", "error");
    },
    onError: (e: any) => notify(e?.message ?? "فشل الاختبار", "error"),
  });

  return (
    <div className="space-y-5 sm:space-y-6" dir="rtl">
      <AdminHero
        icon={Plug}
        title="تكاملات Google Sheets"
        subtitle="كل شيتات جوجل بتتربط من هنا - شاركها مع الـ Service Account ثم ضيفها"
        actions={
          <HeroAction onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4" /> إضافة Integration
          </HeroAction>
        }
      />

      {/* Search */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="ابحث بالاسم، المعرّف، Spreadsheet ID..."
            className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-background border border-border text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            لا توجد تكاملات. اضغط "إضافة Integration" للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="p-3 text-right font-bold">الاسم</th>
                  <th className="p-3 text-right font-bold">Slug</th>
                  <th className="p-3 text-right font-bold">Spreadsheet</th>
                  <th className="p-3 text-right font-bold">Worksheet</th>
                  <th className="p-3 text-right font-bold">الحالة</th>
                  <th className="p-3 text-right font-bold">آخر تحديث</th>
                  <th className="p-3 text-right font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="p-3 align-top">
                      <div className="font-bold">{r.name}</div>
                      {r.description ? (
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.description}</div>
                      ) : null}
                    </td>
                    <td className="p-3 align-top">
                      <code className="text-[11px] px-1.5 py-0.5 rounded bg-muted">{r.slug}</code>
                    </td>
                    <td className="p-3 align-top max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[11px] truncate" dir="ltr">{r.spreadsheet_id}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(r.spreadsheet_id); notify("تم النسخ", "success"); }}
                          className="p-1 rounded hover:bg-muted shrink-0"
                          title="نسخ"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 align-top" dir="ltr">
                      <span className="text-[12px]">{r.worksheet_name}</span>
                    </td>
                    <td className="p-3 align-top">
                      {r.enabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-bold border border-success/30">
                          <CheckCircle2 className="w-3 h-3" /> مفعّل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold">
                          <XCircle className="w-3 h-3" /> موقوف
                        </span>
                      )}
                    </td>
                    <td className="p-3 align-top text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.updated_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => testMutation.mutate(r.id)}
                          disabled={testMutation.isPending && testMutation.variables === r.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:bg-muted text-[11px] font-bold disabled:opacity-50"
                          title="اختبار الاتصال"
                        >
                          <TestTube2 className="w-3.5 h-3.5" />
                          {testMutation.isPending && testMutation.variables === r.id ? "..." : "اختبار"}
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate({ id: r.id, enabled: !r.enabled })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:bg-muted text-[11px] font-bold"
                          title={r.enabled ? "إيقاف" : "تفعيل"}
                        >
                          {r.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => { setEditing(r); setModalOpen(true); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:bg-muted text-[11px] font-bold"
                          title="تعديل"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`مسح "${r.name}"؟`)) deleteMutation.mutate(r.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-[11px] font-bold"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {testResult?.id === r.id && (
                        <TestResultBadge res={testResult.res} onClose={() => setTestResult(null)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border/60 text-xs">
            <span className="text-muted-foreground">
              {filtered.length} من الإجمالي -صفحة {currentPage} / {pageCount}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <IntegrationModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { invalidate(); setModalOpen(false); setEditing(null); }}
          createFn={createFn}
          updateFn={updateFn}
          testFn={testFn}
          notify={notify}
        />
      )}
    </div>
  );
}

function TestResultBadge({ res, onClose }: { res: any; onClose: () => void }) {
  return (
    <div className={`mt-2 p-2 rounded-lg border text-[11px] max-w-md ${res?.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="font-bold">
            {res?.ok ? "✅ الاتصال ناجح" : `❌ ${res?.error ?? "فشل"}`}
          </div>
          <div>Spreadsheet: {res?.spreadsheetFound ? "✔" : "✘"} -Worksheet: {res?.worksheetFound ? "✔" : "✘"} -قراءة: {res?.canRead ? "✔" : "✘"} -كتابة: {res?.canWrite ? "✔" : "✘"}</div>
          {res?.serviceAccountEmail && !res?.ok && (
            <div className="text-muted-foreground">شارك الشيت مع: <code dir="ltr">{res.serviceAccountEmail}</code></div>
          )}
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/10"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

function IntegrationModal({
  initial, onClose, onSaved, createFn, updateFn, testFn, notify,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
  createFn: any; updateFn: any; testFn: any;
  notify: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    spreadsheet_id: initial?.spreadsheet_id ?? "",
    worksheet_name: initial?.worksheet_name ?? "",
    enabled: initial?.enabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<any>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (initial) {
        await updateFn({ data: { id: initial.id, ...form } });
        notify("تم الحفظ", "success");
      } else {
        await createFn({ data: form });
        notify("تم الإنشاء", "success");
      }
      onSaved();
    } catch (e: any) {
      notify(e?.message ?? "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestRes(null);
    try {
      const res = await testFn({
        data: {
          spreadsheet_id: form.spreadsheet_id,
          worksheet_name: form.worksheet_name,
        },
      });
      setTestRes(res);
    } catch (e: any) {
      setTestRes({ ok: false, error: e?.message ?? "خطأ" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
          <h3 className="font-black text-lg">{initial ? "تعديل Integration" : "إضافة Integration جديد"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <Field label="الاسم">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: المنتجات"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </Field>
          <Field label="Slug -المعرّف الفريد (بالإنجليزي فقط)">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="products"
              dir="ltr"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </Field>
          <Field label="الوصف (اختياري)">
            <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none" />
          </Field>
          <Field label="Spreadsheet ID أو رابط الشيت">
            <input value={form.spreadsheet_id} onChange={(e) => setForm({ ...form, spreadsheet_id: e.target.value })}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              dir="ltr"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </Field>
          <Field label="Worksheet -اسم الورقة">
            <input value={form.worksheet_name} onChange={(e) => setForm({ ...form, worksheet_name: e.target.value })}
              placeholder="Sheet1"
              dir="ltr"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <span className="text-sm font-bold">مفعّل</span>
          </label>

          {testRes && (
            <div className={`p-3 rounded-lg border text-xs ${testRes.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
              {testRes.ok ? (
                <div>✅ الاتصال ناجح -الأوراق: {testRes.sheets?.join(", ") ?? ""}</div>
              ) : (
                <div>
                  <div className="font-bold">❌ {testRes.error}</div>
                  {testRes.serviceAccountEmail && (
                    <div className="mt-1">شارك الشيت مع: <code dir="ltr">{testRes.serviceAccountEmail}</code></div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex items-center justify-between gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !form.spreadsheet_id || !form.worksheet_name}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted text-sm font-bold disabled:opacity-50"
          >
            <TestTube2 className="w-4 h-4" /> {testing ? "..." : "اختبار الاتصال"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-border text-sm font-bold hover:bg-muted">
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-extrabold text-sm disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {saving ? "..." : "حفظ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
