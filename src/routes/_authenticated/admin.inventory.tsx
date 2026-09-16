import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, ShieldAlert, RefreshCw, ChevronDown, ChevronUp, Unlink, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { getSheetInfo } from "@/lib/sheet-sync.functions";
import { previewProductSheetTabs, importAllTabsForProduct } from "@/lib/sheet-product-import.functions";
import { getInventoryDuplicatesAdmin, type DuplicatesResult } from "@/lib/stock-sheet.functions";
import { friendlyErrorMessage, showError } from "@/lib/error-handler";
import { Input } from "@/components/ui/input";
import { AdminHero, HeroAction, HeroGlass } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: AdminInventory,
});

// Very small CSV parser (handles quoted fields with commas & escaped quotes)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Normalizes an Arabic/English header cell so different spellings, hamza
 * variants, diacritics, spaces, underscores and dashes all collapse to the
 * same key (e.g. "البريد الإلكتروني", "البريد_الالكتروني", "Email " → same). */
function normalizeHeader(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s_\-\.]+/g, "")
    .trim();
}

// Order matters: more specific fields are matched first so a generic word
// (e.g. "حساب") doesn't steal a column meant for another field.
const FIELD_MATCHERS: Array<{ field: string; matchers: string[] }> = [
  {
    field: "key",
    matchers: [
      "activationkey",
      "activation",
      "licensekey",
      "license",
      "licence",
      "serialkey",
      "serial",
      "productkey",
      "redeemcode",
      "redeem",
      "key",
      "code",
      "مفتاحالتفعيل",
      "مفتاح",
      "كودالتفعيل",
      "الكود",
      "كود",
      "الرمز",
      "رمز",
    ],
  },
  {
    field: "password",
    matchers: [
      "password",
      "passwrd",
      "pass",
      "pwd",
      "الباسورد",
      "باسورد",
      "كلمهالسر",
      "كلمهالمرور",
      "كلمهسر",
      "كلمهمرور",
      "السر",
    ],
  },
  {
    field: "username",
    matchers: [
      "username",
      "user_name",
      "userid",
      "user",
      "login",
      "account",
      "اليوزر",
      "يوزر",
      "اسمالمستخدم",
      "المستخدم",
      "الحساب",
    ],
  },
  {
    field: "email",
    matchers: [
      "email",
      "e-mail",
      "mail",
      "الايميل",
      "ايميل",
      "البريدالالكتروني",
      "بريدالكتروني",
      "بريد",
      "جيميل",
      "gmail",
    ],
  },
  {
    field: "type",
    matchers: ["accounttype", "servicetype", "type", "نوعالحساب", "نوعالخدمه", "نوع"],
  },
  {
    field: "notes",
    matchers: [
      "notes",
      "note",
      "comment",
      "comments",
      "remark",
      "description",
      "الملاحظات",
      "ملاحظات",
      "ملاحظه",
      "ملحوظه",
    ],
  },
  {
    field: "status",
    matchers: ["status", "state", "الحاله", "حاله"],
  },
];

/** Map CSV rows → inventory records. Recognizes many English/Arabic spellings
 * of email, username, password, activation key/code, notes, type (case- and
 * hamza/diacritic-insensitive). Any column that doesn't match a known field
 * is never dropped -it's folded into notes as "header: value" so no data
 * from the file is ever lost, whatever the column names look like. */
function mapRows(rows: string[][]): { records: any[]; statusColIdx: number } {
  if (rows.length === 0) return { records: [], statusColIdx: -1 };
  const rawHeader = rows[0].map((h) => h.trim());
  const header = rawHeader.map(normalizeHeader);
  const used = new Set<number>();
  const idx: Record<string, number> = {};

  for (const { field, matchers } of FIELD_MATCHERS) {
    let found = -1;
    for (let i = 0; i < header.length; i++) {
      if (used.has(i)) continue;
      const h = header[i];
      if (!h) continue;
      if (matchers.some((m) => h === m || h.includes(m))) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      idx[field] = found;
      used.add(found);
    }
  }

  // No recognized identity column at all → fall back to the first unused
  // column as the username/key, so a completely differently-named sheet
  // still imports something instead of silently importing nothing.
  if (idx.key === undefined && idx.username === undefined && idx.email === undefined) {
    const fallback = header.findIndex((_, i) => !used.has(i));
    if (fallback >= 0) {
      idx.username = fallback;
      used.add(fallback);
    }
  }

  const extraColIdxs = header.map((_, i) => i).filter((i) => !used.has(i));
  const clean = (r: string[], i: number | undefined) =>
    i !== undefined && i >= 0 ? (r[i] ?? "").trim() || null : null;

  const records = rows
    .slice(1)
    .map((r, rIdx) => {
      const baseNotes = clean(r, idx.notes);
      const extraParts = extraColIdxs
        .map((i) => {
          const label = rawHeader[i] || `col${i + 1}`;
          const val = (r[i] ?? "").trim();
          return val ? `${label}: ${val}` : null;
        })
        .filter(Boolean);
      const extra_notes = [baseNotes, ...extraParts].filter(Boolean).join(" | ") || null;

      return {
        account_email: clean(r, idx.email),
        account_username: clean(r, idx.username) ?? clean(r, idx.key),
        account_password: clean(r, idx.password),
        account_type: clean(r, idx.type),
        extra_notes,
        _srcRowIndex: rIdx + 2, // header is row 1
      };
    })
    .filter((rec) => rec.account_email || rec.account_username || rec.account_password || rec.extra_notes);
  return { records, statusColIdx: idx.status ?? -1 };
}

/** Convert 0-based column index to A1 letter (0=A, 25=Z, 26=AA...). */
function colIdxToLetter(idx: number): string {
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function AdminInventory() {
  const { notify, lang } = useApp();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearingAll, setClearingAll] = useState(false);
  const isAr = lang === "ar";

  const plans = useQuery({
    queryKey: ["instant-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name_ar, delivery_type, google_spreadsheet_id, product_plans(id, label_ar, label_en, duration_days, plan_variant, account_type, sheet_csv_url)",
        )
        .eq("delivery_type", "instant");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invStats = useQuery({
    queryKey: ["inventory-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("account_inventory").select("plan_id, status");
      const m: Record<string, { available: number; delivered: number }> = {};
      (data ?? []).forEach((r: any) => {
        m[r.plan_id] = m[r.plan_id] ?? { available: 0, delivered: 0 };
        (m[r.plan_id] as any)[r.status]++;
      });
      return m;
    },
  });

  const dupesFn = useServerFn(getInventoryDuplicatesAdmin);
  const dupesQ = useQuery({
    queryKey: ["inventory-duplicates-admin"],
    queryFn: () => dupesFn({ data: {} }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Force a fresh scan (bypasses the 5-min server cache) and updates the query.
  const rescanDuplicates = async () => {
    try {
      const fresh = await dupesFn({ data: { force: true } });
      qc.setQueryData(["inventory-duplicates-admin"], fresh);
    } catch (e) {
      console.error("rescan duplicates failed", e);
      qc.invalidateQueries({ queryKey: ["inventory-duplicates-admin"] });
    }
  };

  const refreshAllSheets = async () => {
    const linked = (plans.data ?? []).filter((p: any) => p.google_spreadsheet_id);
    if (linked.length === 0) {
      notify("مفيش أي منتج مربوط بشيت.", "info");
      return;
    }
    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: linked.length });
    let totalInserted = 0;
    let failed = 0;
    for (let i = 0; i < linked.length; i++) {
      const p: any = linked[i];
      try {
        const res = await importAllTabsForProduct({
          data: { productId: p.id, spreadsheetId: p.google_spreadsheet_id, overrides: [] },
        });
        totalInserted += res.results.reduce((s: number, r: any) => s + r.inserted, 0);
      } catch (e) {
        console.error("refresh failed for", p.name_ar, e);
        failed++;
      }
      setRefreshProgress({ done: i + 1, total: linked.length });
    }
    qc.invalidateQueries({ queryKey: ["inventory-counts"] });
    qc.invalidateQueries({ queryKey: ["instant-plans"] });
    qc.invalidateQueries({ queryKey: ["inventory-rows"] });
    qc.invalidateQueries({ queryKey: ["inventory-batches"] });
    await rescanDuplicates();
    notify(
      `تم التحديث: ${totalInserted} حساب جديد من ${linked.length - failed}/${linked.length} منتج${failed ? ` (فشل ${failed})` : ""}`,
      failed ? "info" : "success",
    );
    setRefreshingAll(false);
    setRefreshProgress(null);
  };

  const linkedCount =
    (plans.data ?? []).filter((p: any) => p.google_spreadsheet_id).length +
    (plans.data ?? []).reduce(
      (s: number, p: any) =>
        s + (p.product_plans ?? []).filter((pl: any) => pl.sheet_csv_url).length,
      0,
    );

  const submitClearAllSheets = async () => {
    if (!clearPassword) {
      notify(isAr ? "يجب إدخال الباسورد الإداري" : "Admin password is required", "error");
      return;
    }
    setClearingAll(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error(isAr ? "سجّل الدخول أولاً" : "Not authenticated");
      const { data: passwordData, error: passwordError } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();
      if (passwordError) throw passwordError;
      if (!passwordData?.value)
        throw new Error(isAr ? "لم يتم تعيين باسورد إداري" : "Admin password not set");
      if (clearPassword !== passwordData.value) {
        throw new Error(isAr ? "الباسورد غير صحيح" : "Incorrect password");
      }

      // 1) Delete EVERYTHING imported from sheets (available + delivered).
      // Customer deliveries stay safe: credentials are already snapshotted
      // into `delivered_accounts` at delivery time.
      // Instant UI: wipe the local caches first so every panel empties
      // immediately, then confirm with a background refetch.
      qc.setQueryData(["inventory-counts"], {});
      qc.removeQueries({ queryKey: ["inventory-rows"] });
      qc.removeQueries({ queryKey: ["inventory-batches"] });
      const { error: delError, count } = await supabase
        .from("account_inventory")
        .delete({ count: "exact" })
        .eq("source", "sheet");
      if (delError) throw delError;

      // 2) Unlink every product-level spreadsheet + every plan-level CSV link.
      const { error: prodError } = await supabase
        .from("products")
        .update({ google_spreadsheet_id: null })
        .not("google_spreadsheet_id", "is", null);
      if (prodError) throw prodError;
      const { error: planError } = await supabase
        .from("product_plans")
        .update({ sheet_csv_url: null })
        .not("sheet_csv_url", "is", null);
      if (planError) throw planError;

      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["instant-plans"] });
      qc.invalidateQueries({ queryKey: ["inventory-rows"] });
      qc.invalidateQueries({ queryKey: ["inventory-batches"] });
      await rescanDuplicates();
      setShowClearDialog(false);
      setClearPassword("");
      notify(
        isAr
          ? `تم فك ربط كل الشيتات ومسح ${count ?? 0} حساب مسترد لحظياً`
          : `Unlinked all sheets, cleared ${count ?? 0} imported accounts instantly`,
        "success",
      );
    } catch (e: any) {
      showError(e, notify, lang);
      // The caches were wiped optimistically - refetch to restore the UI.
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["inventory-rows"] });
      qc.invalidateQueries({ queryKey: ["inventory-batches"] });
      setClearPassword("");
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div>
      <AdminHero
        icon={Boxes}
        title="مخزون التسليم الفوري"
        subtitle="كل خدمة تسليم فوري لازم يكون لها مخزون حسابات جاهزة"
        actions={
          <>
            <HeroAction onClick={refreshAllSheets} disabled={refreshingAll || !plans.data?.length}>
              <span className={refreshingAll ? "animate-spin" : ""}>↻</span>
              {refreshingAll
                ? `جاري التحديث... ${refreshProgress?.done ?? 0}/${refreshProgress?.total ?? 0}`
                : "تحديث كل الشيتات"}
            </HeroAction>
            <HeroGlass>
              <button
                onClick={() => {
                  if (!linkedCount) {
                    notify(isAr ? "مفيش أي شيت مربوط أصلاً" : "No sheets linked", "info");
                    return;
                  }
                  setClearPassword("");
                  setShowClearDialog(true);
                }}
                className="inline-flex items-center gap-1.5 text-red-100 hover:text-white"
              >
                <Unlink className="size-4" />
                {isAr ? `مسح كل الشيتات (${linkedCount})` : `Unlink all (${linkedCount})`}
              </button>
            </HeroGlass>
          </>
        }
      />
      <div className="h-3 sm:h-4" />
      <p className="text-xs text-muted-foreground mb-4">
        لما العميل يشتري، النظام هيسحب أول حساب متاح تلقائيًا ويثبّت الطلب "تم التسليم".
        <br />
        <b>طرق الرفع:</b> ملف CSV من عندك، أو لينك Google Sheets منشور على شكل CSV (File → Share → Publish to web →
        CSV).
      </p>

      {plans.data?.length === 0 && (
        <div className="p-8 text-center bg-card border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">مفيش خدمات "تسليم فوري" لسه. غيّر نوع التسليم من صفحة الخدمات.</p>
        </div>
      )}

      <div className="mb-4">
        <DuplicatesAlert
          data={dupesQ.data}
          isFetching={dupesQ.isFetching}
          isLoading={dupesQ.isLoading}
          error={dupesQ.error as Error | null}
          onRefresh={() => rescanDuplicates()}
        />
      </div>

      <div className="space-y-4">
        {plans.data?.map((p: any) => (
          <div key={p.id} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="font-bold">{p.name_ar}</div>
              <div className="text-xs text-muted-foreground">{p.product_plans?.length ?? 0} عرض</div>
            </div>
            <ProductSheetPanel
              productId={p.id}
              initialSpreadsheetId={p.google_spreadsheet_id ?? ""}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ["inventory-counts"] });
                qc.invalidateQueries({ queryKey: ["instant-plans"] });
                rescanDuplicates();
              }}
            />
            <div className="p-4 space-y-3">
              {(p.product_plans ?? []).map((pl: any) => {
                const c = invStats.data?.[pl.id] ?? { available: 0, delivered: 0 };
                return (
                  <div key={pl.id} className="p-3 bg-background border border-border rounded-xl">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                          <span>{pl.label_ar}</span>
                          {pl.label_en && (
                            <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                              {pl.label_en}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {pl.plan_variant && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-brand/10 text-brand">
                              نوع الخطة: {pl.plan_variant}
                            </span>
                          )}
                          {pl.account_type && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary">
                              نوع الحساب: {pl.account_type}
                            </span>
                          )}
                          {pl.duration_days ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">
                              مدة: {pl.duration_days} يوم
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <span className="text-success font-bold">متاح: {c.available}</span>
                          <span className="mx-2">·</span>
                          <span>تم تسليمها: {c.delivered}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelected(selected === pl.id ? null : pl.id)}
                        className="px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-bold"
                      >
                        {selected === pl.id ? "إخفاء" : "إدارة المخزون"}
                      </button>
                    </div>
                    {selected === pl.id && (
                      <PlanInventoryPanel
                        planId={pl.id}
                        initialSheetUrl={pl.sheet_csv_url ?? ""}
                        onChange={() => {
                          qc.invalidateQueries({ queryKey: ["inventory-counts"] });
                          qc.invalidateQueries({ queryKey: ["instant-plans"] });
                          notify("تم التحديث", "success");
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showClearDialog &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            onClick={() => {
              setShowClearDialog(false);
              setClearPassword("");
            }}
          >
            <div
              className="bg-card border border-border rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                  <Unlink className="size-5" />
                </span>
                <h3 className="text-lg font-bold">
                  {isAr ? "مسح كل الشيتات المربوطة" : "Unlink all sheets"}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-relaxed">
                {isAr
                  ? `هيتم فك ربط ${linkedCount} شيت/لينك ومسح كل الحسابات المستردة منهم لحظياً (المتاحة والمُسلَّمة). بيانات العملاء المُسلَّمة محفوظة في طلباتهم. أدخل الباسورد الإداري للتأكيد:`
                  : `This unlinks ${linkedCount} sheet(s) and instantly deletes every imported account (available + delivered). Customer deliveries stay saved in their orders. Enter the admin password to confirm:`}
              </p>
              <div className="relative mb-5">
                <Lock className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={isAr ? "الباسورد الإداري" : "Admin password"}
                  value={clearPassword}
                  onChange={(e) => setClearPassword(e.target.value)}
                  className="w-full ps-9"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitClearAllSheets();
                  }}
                />
              </div>
              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => {
                    setShowClearDialog(false);
                    setClearPassword("");
                  }}
                  className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl font-bold text-xs sm:text-sm hover:bg-muted/80 transition"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button
                  onClick={submitClearAllSheets}
                  disabled={clearingAll}
                  className="px-5 py-2.5 bg-destructive text-destructive-foreground rounded-xl font-bold text-xs sm:text-sm hover:bg-destructive/90 transition shadow-md disabled:opacity-50"
                >
                  {clearingAll
                    ? isAr
                      ? "جارٍ المسح..."
                      : "Clearing..."
                    : isAr
                      ? "مسح الكل"
                      : "Clear all"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function PlanInventoryPanel({
  planId,
  initialSheetUrl,
  onChange,
}: {
  planId: string;
  initialSheetUrl: string;
  onChange: () => void;
}) {
  const { notify, confirm, lang } = useApp();
  const qc = useQueryClient();
  const [sheetUrl, setSheetUrl] = useState(initialSheetUrl);
  const [busy, setBusy] = useState(false);

  const rows = useQuery({
    queryKey: ["inventory-rows", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_inventory")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const insertRows = async (records: any[], source: string) => {
    if (records.length === 0) {
      notify(lang === "ar" ? "مفيش صفوف صالحة في الملف" : "No valid rows in the file", "error");
      return;
    }
    setBusy(true);
    try {
      const batchId = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const payload = records.map((r) => {
        const { _srcRowIndex, ...rest } = r;
        return { ...rest, plan_id: planId, source, import_batch_id: batchId };
      });
      const { error } = await supabase.from("account_inventory").insert(payload);
      if (error) throw error;
      const available =
        (
          await supabase
            .from("account_inventory")
            .select("id", { count: "exact", head: true })
            .eq("plan_id", planId)
            .eq("status", "available")
        ).count ?? 0;
      await supabase.from("product_plans").update({ stock: available }).eq("id", planId);
      notify(`تمت إضافة ${records.length} حساب`, "success");
      qc.invalidateQueries({ queryKey: ["inventory-rows", planId] });
      qc.invalidateQueries({ queryKey: ["inventory-batches", planId] });
      onChange();
    } catch (e: any) {
      showError(e, notify, lang);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { records } = mapRows(parseCsv(text));
    await insertRows(records, "csv");
  };

  const normalizeSheetUrl = (raw: string): string => {
    const url = raw.trim();
    if (/output=csv/i.test(url) || /[?&]format=csv/i.test(url)) return url;
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m) {
      const id = m[1];
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : "0";
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    }
    return url;
  };

  const handleFetchSheet = async () => {
    if (!sheetUrl.trim()) return;
    const normalized = normalizeSheetUrl(sheetUrl);
    try {
      const host = new URL(normalized).hostname.toLowerCase();
      if (host !== "docs.google.com" && !host.endsWith(".googleusercontent.com")) {
        notify("الرابط لازم يكون Google Sheets فقط (docs.google.com).", "error");
        return;
      }
    } catch {
      notify("رابط غير صالح.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(normalized);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) {
        throw new Error(
          "اللينك بيرجّع HTML مش CSV. خلي الشيت Shared: Anyone with link ، Viewer، أو File → Share → Publish to web → CSV.",
        );
      }
      const { records, statusColIdx } = mapRows(parseCsv(text));

      // Try to attach sheet metadata for auto-sync-on-sold.
      const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = sheetUrl.match(/[#&?]gid=([0-9]+)/);
      const spreadsheetId = idMatch?.[1] ?? null;
      const gid = gidMatch ? Number(gidMatch[1]) : 0;

      let sheetTitle: string | null = null;
      if (spreadsheetId) {
        try {
          const info = await getSheetInfo({ data: { spreadsheetId } });
          sheetTitle = info.sheets.find((s: any) => s.gid === gid)?.title ?? info.sheets[0]?.title ?? null;
        } catch (e) {
          console.warn("getSheetInfo failed", e);
        }
      }

      const statusColLetter = statusColIdx >= 0 ? colIdxToLetter(statusColIdx) : null;
      const canSync = !!(spreadsheetId && sheetTitle && statusColLetter);

      const enriched = records.map((r: any) => ({
        ...r,
        spreadsheet_id: canSync ? spreadsheetId : null,
        sheet_title: canSync ? sheetTitle : null,
        sheet_row_index: canSync ? r._srcRowIndex : null,
        status_column_letter: canSync ? statusColLetter : null,
      }));

      await supabase.from("product_plans").update({ sheet_csv_url: sheetUrl.trim() }).eq("id", planId);
      await insertRows(enriched, "sheet");

      if (!canSync) {
        notify(
          "تم الاستيراد بدون مزامنة تلقائية. أضف عمود اسمه 'status' في الشيت عشان يتحدّث تلقائيًا لما يتباع.",
          "info",
        );
      }
    } catch (e: any) {
      console.error("sheet import failed", e);
      notify(
        (lang === "ar" ? "تعذر قراءة الشيت: " : "Failed to read the sheet: ") + friendlyErrorMessage(e, lang),
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const syncStock = async () => {
    const available =
      (
        await supabase
          .from("account_inventory")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", planId)
          .eq("status", "available")
      ).count ?? 0;
    await supabase.from("product_plans").update({ stock: available }).eq("id", planId);
  };

  const delRow = async (id: string) => {
    const ok = await confirm({ title: "حذف حساب", message: "متأكد؟", tone: "danger", confirmLabel: "احذف" });
    if (!ok) return;
    await supabase.from("account_inventory").delete().eq("id", id);
    await syncStock();
    qc.invalidateQueries({ queryKey: ["inventory-rows", planId] });
    qc.invalidateQueries({ queryKey: ["inventory-batches", planId] });
    onChange();
  };

  const batches = useQuery({
    queryKey: ["inventory-batches", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_inventory")
        .select("import_batch_id, source, created_at, status")
        .eq("plan_id", planId)
        .not("import_batch_id", "is", null);
      const map = new Map<
        string,
        { id: string; source: string; created_at: string; total: number; available: number; delivered: number }
      >();
      (data ?? []).forEach((r: any) => {
        const k = r.import_batch_id as string;
        const cur = map.get(k) ?? {
          id: k,
          source: r.source,
          created_at: r.created_at,
          total: 0,
          available: 0,
          delivered: 0,
        };
        cur.total++;
        if (r.status === "available") cur.available++;
        else if (r.status === "delivered") cur.delivered++;
        if (new Date(r.created_at) < new Date(cur.created_at)) cur.created_at = r.created_at;
        map.set(k, cur);
      });
      return Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });

  const delBatch = async (batchId: string, opts: { onlyAvailable: boolean }) => {
    const ok = await confirm({
      title: "حذف عملية استرداد",
      message: opts.onlyAvailable
        ? "هيتم حذف الحسابات المتاحة فقط من هذه العملية. الحسابات اللي اتسلمت للعملاء هتفضل. متأكد؟"
        : "هيتم حذف كل الحسابات اللي جت من عملية الاسترداد دي (المتاحة والمسلَّمة). متأكد؟",
      tone: "danger",
      confirmLabel: "احذف",
    });
    if (!ok) return;
    let q = supabase.from("account_inventory").delete().eq("plan_id", planId).eq("import_batch_id", batchId);
    if (opts.onlyAvailable) q = q.eq("status", "available");
    const { error } = await q;
    if (error) {
      showError(error, notify, lang);
      return;
    }
    await syncStock();
    notify("تم حذف عملية الاسترداد", "success");
    qc.invalidateQueries({ queryKey: ["inventory-rows", planId] });
    qc.invalidateQueries({ queryKey: ["inventory-batches", planId] });
    onChange();
  };

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="p-3 bg-card border border-border rounded-lg">
          <div className="text-xs font-bold mb-2">رفع ملف CSV</div>
          <p className="text-[11px] text-muted-foreground mb-2">
            الصفوف: <code>email, username, password, notes</code> ، أول صف Header.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-xs"
          />
        </div>
        <div className="p-3 bg-card border border-border rounded-lg">
          <div className="text-xs font-bold mb-2">لينك Google Sheets (CSV)</div>
          <div className="flex gap-2">
            <input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
              className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-xs"
            />
            <button
              onClick={handleFetchSheet}
              disabled={busy || !sheetUrl.trim()}
              className="px-3 py-1.5 bg-brand text-brand-foreground rounded text-xs font-bold disabled:opacity-50"
            >
              {busy ? "..." : "استيراد"}
            </button>
          </div>
          {initialSheetUrl && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "إلغاء الاسترداد من الشيت",
                  message:
                    "هيتم مسح اللينك وحذف كل الحسابات المتاحة اللي جت من الشيت ده. (الحسابات اللي اتسلمت للعملاء هتفضل محفوظة). متأكد؟",
                  tone: "danger",
                  confirmLabel: "ألغِ الاسترداد",
                });
                if (!ok) return;
                setBusy(true);
                try {
                  const { error } = await supabase
                    .from("account_inventory")
                    .delete()
                    .eq("plan_id", planId)
                    .eq("source", "sheet")
                    .eq("status", "available");
                  if (error) throw error;
                  await supabase.from("product_plans").update({ sheet_csv_url: null }).eq("id", planId);
                  await syncStock();
                  setSheetUrl("");
                  notify("تم إلغاء الاسترداد ومسح اللينك", "success");
                  qc.invalidateQueries({ queryKey: ["inventory-rows", planId] });
                  qc.invalidateQueries({ queryKey: ["inventory-batches", planId] });
                  onChange();
                } catch (e: any) {
                  showError(e, notify, lang);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="mt-2 px-2 py-1 bg-destructive/10 text-destructive rounded text-[11px] font-bold disabled:opacity-50"
            >
              إلغاء الاسترداد من هذا الشيت ومسح اللينك
            </button>
          )}
        </div>
      </div>

      {!!batches.data?.length && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-2 bg-muted text-xs font-bold">عمليات الاسترداد ({batches.data.length})</div>
          <div className="max-h-48 overflow-y-auto divide-y divide-border">
            {batches.data.map((b) => (
              <div key={b.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-mono truncate">{new Date(b.created_at).toLocaleString("ar-EG")}</div>
                  <div className="text-muted-foreground text-[11px]">
                    {b.source === "sheet" ? "Google Sheet" : "CSV"} · {b.total} حساب ·
                    <span className="text-success"> متاح {b.available}</span> ·<span> مسلَّم {b.delivered}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {b.available > 0 && (
                    <button
                      onClick={() => delBatch(b.id, { onlyAvailable: true })}
                      className="px-2 py-1 bg-destructive/10 text-destructive rounded font-bold text-[11px]"
                      title="حذف المتاح فقط"
                    >
                      حذف المتاح
                    </button>
                  )}
                  <button
                    onClick={() => delBatch(b.id, { onlyAvailable: false })}
                    className="px-2 py-1 bg-destructive text-destructive-foreground rounded font-bold text-[11px]"
                    title="حذف الكل من هذه العملية"
                  >
                    حذف الكل
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const COLS: { key: string; label: string; mask?: boolean }[] = [
          { key: "account_email", label: "Email" },
          { key: "account_username", label: "Key / User" },
          { key: "account_password", label: "Pass", mask: true },
          { key: "account_type", label: "نوع الخدمة" },
          { key: "extra_notes", label: "Notes" },
        ];
        const visible = COLS.filter((c) =>
          (rows.data ?? []).some((r: any) => r[c.key] != null && String(r[c.key]).trim() !== ""),
        );

        // إضافة تفاصيل الخطة إذا كانت متاحة
        const hasPlanDetails = (rows.data ?? []).some(
          (r: any) => r.plan_name_ar || r.plan_name_en || r.plan_duration_days || r.plan_type || r.account_type,
        );

        const colSpan = visible.length + 2 + (hasPlanDetails ? 1 : 0);
        return (
          <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-start">
                  {visible.map((c) => (
                    <th key={c.key} className="p-2 text-start">
                      {c.label}
                    </th>
                  ))}
                  {hasPlanDetails && <th className="p-2 text-start">تفاصيل الخطة</th>}
                  <th className="p-2 text-start">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.data?.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    {visible.map((c) => (
                      <td key={c.key} className="p-2 font-mono truncate max-w-[160px]">
                        {c.mask ? (r[c.key] ? "••••" : "") : r[c.key]}
                      </td>
                    ))}
                    {hasPlanDetails && (
                      <td className="p-2 text-xs">
                        {r.plan_name_ar && <div className="font-bold">{r.plan_name_ar}</div>}
                        {r.plan_name_en && <div className="text-muted-foreground">{r.plan_name_en}</div>}
                        {r.plan_duration_days && (
                          <div className="text-muted-foreground">مدة: {r.plan_duration_days} يوم</div>
                        )}
                        {r.plan_type && <div className="text-muted-foreground">نوع الخطة: {r.plan_type}</div>}
                        {r.account_type && <div className="text-muted-foreground">نوع الحساب: {r.account_type}</div>}
                      </td>
                    )}
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.status === "available" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                      >
                        {r.status === "delivered" ? "تم البيع" : r.status}
                      </span>
                    </td>
                    <td className="p-2 text-end">
                      <button onClick={() => delRow(r.id)} className="text-destructive hover:underline">
                        مسح
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.data?.length && (
                  <tr>
                    <td colSpan={colSpan} className="p-4 text-center text-muted-foreground">
                      مفيش حسابات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

function extractSpreadsheetId(raw: string): string {
  const s = raw.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

function ProductSheetPanel({
  productId,
  initialSpreadsheetId,
  onChange,
}: {
  productId: string;
  initialSpreadsheetId: string;
  onChange: () => void;
}) {
  const { notify, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(initialSpreadsheetId);
  const [preview, setPreview] = useState<{
    tabs: Array<{ gid: number; title: string }>;
    matches: Array<{ plan_id: string; plan_label: string; tab_title: string | null; tab_gid: number | null }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    const id = extractSpreadsheetId(input);
    if (!id) {
      notify(lang === "ar" ? "أدخل لينك أو ID الشيت" : "Enter a sheet link or ID", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await previewProductSheetTabs({ data: { productId, spreadsheetId: id } });
      setPreview(res);
    } catch (e: any) {
      showError(e, notify, lang);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    const id = extractSpreadsheetId(input);
    if (!id) return;
    setBusy(true);
    try {
      const overrides = (preview?.matches ?? [])
        .filter((m) => m.tab_title)
        .map((m) => ({ plan_id: m.plan_id, tab_title: m.tab_title! }));
      const res = await importAllTabsForProduct({
        data: { productId, spreadsheetId: id, overrides },
      });
      const totalInserted = res.results.reduce((s, r) => s + r.inserted, 0);
      const matchedTabs = res.results.filter((r) => r.tab_title).length;
      const summary =
        lang === "ar"
          ? `تم استيراد ${totalInserted} حساب من ${matchedTabs} tab`
          : `Imported ${totalInserted} accounts from ${matchedTabs} tabs`;

      // If nothing (or fewer than expected) got imported, tell the admin
      // WHY per plan/tab instead of just showing a number -previously the
      // reason (no_matching_tab / no_available_rows / insert_failed) was
      // computed but never shown, so "0 imported" looked unexplainable even
      // though the server knew exactly what happened.
      const NOTE_LABELS_AR: Record<string, string> = {
        no_matching_tab: "مفيش تاب في الشيت باسم يطابق اسم الخطة",
        no_available_rows: "كل الصفوف متعلّم عليها إنها مش متاحة (status)",
      };
      const problems = res.results
        .filter((r) => r.inserted === 0)
        .map((r) => {
          const reasonKey = r.note?.split("_failed")[0] === "insert" ? "insert_failed" : r.note;
          const reason =
            (reasonKey && NOTE_LABELS_AR[reasonKey]) ??
            (r.note?.startsWith("insert_failed") ? r.note : null) ??
            (lang === "ar" ? "بدون تفاصيل" : "no details");
          return `• ${r.plan_label}${r.tab_title ? ` (${r.tab_title})` : ""}: ${reason}`;
        });

      if (totalInserted === 0 && problems.length > 0) {
        notify(`${summary}\n${problems.join("\n")}`, "error");
      } else {
        notify(summary, "success");
      }
      onChange();
    } catch (e: any) {
      showError(e, notify, lang);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-border bg-brand/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-brand hover:bg-brand/10"
      >
        <span>ملف واحد للمنتج (Google Sheet مع tab لكل خطة)</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-4 space-y-3 text-sm">
          <p className="text-xs text-muted-foreground leading-relaxed">
            الصق لينك الملف. النظام هيدور على tab اسمه مطابق لاسم كل خطة (زي "1 شهر", "3 شهور") ويستورد الحسابات من كل
            tab للخطة اللي بتخصها. كل tab لازم يكون فيه عمود اسمه <b>status</b> علشان المزامنة التلقائية تشتغل.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-background text-sm"
              dir="ltr"
            />
            <button
              onClick={runPreview}
              disabled={busy}
              className="px-3 py-2 bg-brand/10 text-brand rounded-lg text-xs font-bold disabled:opacity-50"
            >
              معاينة الـ Tabs
            </button>
          </div>
          {preview && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                الـ Tabs الموجودة في الملف: {preview.tabs.map((t) => t.title).join(" · ") || "لا يوجد"}
              </div>
              <div className="rounded-lg border border-border overflow-hidden bg-background">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-start">الخطة</th>
                      <th className="p-2 text-start">Tab المطابق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matches.map((m) => (
                      <tr key={m.plan_id} className="border-t border-border">
                        <td className="p-2 font-bold">{m.plan_label}</td>
                        <td className="p-2">
                          {m.tab_title ? (
                            <span className="text-success">✓ {m.tab_title}</span>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => {
                                setPreview({
                                  ...preview,
                                  matches: preview.matches.map((x) =>
                                    x.plan_id === m.plan_id ? { ...x, tab_title: e.target.value || null } : x,
                                  ),
                                });
                              }}
                              className="px-2 py-1 rounded border border-border bg-background text-xs"
                            >
                              <option value="">-اختر tab -</option>
                              {preview.tabs.map((t) => (
                                <option key={t.gid} value={t.title}>
                                  {t.title}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={runImport}
                disabled={busy}
                className="w-full px-3 py-2 bg-brand text-brand-foreground rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {busy ? "جاري الاستيراد..." : "استيراد كل الـ Tabs المطابقة"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DuplicatesAlert({
  data,
  isFetching,
  isLoading,
  error,
  onRefresh,
}: {
  data: DuplicatesResult | undefined;
  isFetching: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Collapsed by default so the scan panel never eats vertical space.
  const [collapsed, setCollapsed] = useState(true);

  // Error state
  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-destructive/15 text-destructive shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-destructive">فحص التكرار فشل</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{friendlyErrorMessage(error)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive text-xs font-bold hover:bg-destructive/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            إعادة الفحص
          </button>
        </div>
      </div>
    );
  }

  // Loading state - slim single row
  if (isLoading || (!data && isFetching)) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-2.5 flex items-center gap-2.5">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">جاري فحص التكرار في كل الشيتات المربوطة…</span>
      </div>
    );
  }

  // Clean state (no duplicates) - slim single row, nothing to expand
  if (data && data.duplicateCount === 0) {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand/5 px-4 py-2.5 flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <ShieldAlert className="w-3.5 h-3.5" />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          <b className="text-brand">مفيش تكرار</b>
          {" - "}
          <b className="tabular-nums">{data.scannedTabs}</b> تاب ·{" "}
          <b className="tabular-nums">{data.totalCodes}</b> كود
        </p>
        <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
          نضيف ✓
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/40 px-2.5 py-1 text-[11px] font-bold text-brand hover:bg-brand/10"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          فحص
        </button>
      </div>
    );
  }

  if (!data) return null;
  const shown = open ? data.groups : data.groups.slice(0, 3);
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      {/* Slim header - click to expand/collapse the full details */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-start hover:bg-amber-500/10 transition"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600">
          <ShieldAlert className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">
          <b className="text-amber-600">
            <span className="tabular-nums">{data.duplicateCount}</span> كود مكرر
          </b>{" "}
          <span className="text-muted-foreground">
            في <b className="tabular-nums">{data.scannedTabs}</b> تاب · دوس للتفاصيل
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
          {g_crossFileCount(data) > 0 ? `خطر: ${g_crossFileCount(data)} بين فايلين` : "مراجعة"}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRefresh();
            }
          }}
          title="إعادة الفحص"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 px-2.5 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-500/10"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          فحص
        </span>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-amber-600" />
        ) : (
          <ChevronUp className="w-4 h-4 shrink-0 text-amber-600" />
        )}
      </button>
      {!collapsed && (
        <div className="border-t border-amber-500/30 px-4 py-3">
          <div className="grid gap-2">
            {shown.map((g) => (
              <div key={g.code} className="rounded-xl border border-amber-500/30 bg-background/60 p-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <code
                    className="text-xs sm:text-sm font-mono bg-muted px-2 py-1 rounded-md truncate max-w-[240px] sm:max-w-[420px]"
                    dir="ltr"
                  >
                    {g.code}
                  </code>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                    ×{g.count}
                  </span>
                  {g.crossFile && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                      بين فايلين
                    </span>
                  )}
                  {!g.crossFile && g.crossTab && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand/15 text-brand">
                      بين تابين
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-[11px] sm:text-xs text-muted-foreground">
                  {g.locations.map((loc, i) => (
                    <li key={`${loc.spreadsheetId}-${loc.tab}-${loc.row}-${i}`} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      <span className="truncate">
                        <b className="text-foreground">{loc.spreadsheetTitle}</b>
                        {" · "}
                        <span className="text-foreground">{loc.tab}</span>
                        {" · "}
                        صف <span className="tabular-nums">{loc.row}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {data.groups.length > 3 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:underline"
            >
              {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {open ? "إخفاء" : `عرض الكل (${data.groups.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function g_crossFileCount(data: DuplicatesResult) {
  return data.groups.filter((g) => g.crossFile).length;
}
