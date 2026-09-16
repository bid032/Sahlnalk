import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://sheets.googleapis.com/v4";

/** fetch with Google service-account auth (no Lovable connector). */
async function gfetch(url: string, init: RequestInit = {}) {
  const { googleSheetsFetch } = await import("@/lib/google-sheets.server");
  return googleSheetsFetch(url, init);
}

function authHeaders() {
  return { "Content-Type": "application/json" } as Record<string, string>;
}

/** Normalizes a plan-label / sheet-tab title so tab matching survives the
 * same spelling differences normalizeHeader tolerates (hamza forms, ta-marbuta,
 * spacing) -without this, a tab named "الباقة الشهرية" would fail to match
 * a plan labeled "الباقه الشهريه" and the whole tab would be skipped on
 * import (0 accounts imported) even though the sheet data is perfectly readable. */
function normalizeTitle(s: string): string {
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

function colIdxToLetter(idx: number): string {
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
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

function mapSheetRows(values: string[][]) {
  if (!values || values.length === 0) return { records: [], statusColIdx: -1 };
  const rawHeader = (values[0] || []).map((h) => (h || "").trim());
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

  // Any column that didn't match a known field is never dropped -fold it
  // into the notes as "header: value" so no data from the sheet is lost.
  const extraColIdxs = header.map((_, i) => i).filter((i) => !used.has(i));

  const clean = (r: string[], i: number | undefined) =>
    i !== undefined && i >= 0 ? (r[i] ?? "").trim() || null : null;

  const records = values
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
        _srcRowIndex: rIdx + 2,
        _statusValue: idx.status !== undefined ? (r[idx.status] ?? "").trim().toLowerCase() : "",
      };
    })
    .filter((rec) => rec.account_email || rec.account_username || rec.account_password || rec.extra_notes);

  return { records, statusColIdx: idx.status ?? -1 };
}

/** Preview: list tabs in the spreadsheet and match each to a plan by label. */
export const previewProductSheetTabs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string; spreadsheetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const infoRes = await gfetch(`${GATEWAY}/spreadsheets/${data.spreadsheetId}?fields=sheets.properties`, {
      headers: authHeaders(),
    });
    if (!infoRes.ok) {
      const t = await infoRes.text();
      throw new Error(`Google Sheets ${infoRes.status}: ${t}`);
    }
    const info = (await infoRes.json()) as {
      sheets?: Array<{ properties: { sheetId: number; title: string } }>;
    };
    const tabs = (info.sheets ?? []).map((s) => ({
      gid: s.properties.sheetId,
      title: s.properties.title,
    }));

    const { data: plans, error: pErr } = await context.supabase
      .from("product_plans")
      .select("id, label_ar, label_en")
      .eq("product_id", data.productId);
    if (pErr) throw pErr;

    const matches = (plans ?? []).map((pl: any) => {
      const targets = [normalizeTitle(pl.label_ar), normalizeTitle(pl.label_en)].filter(Boolean);
      const tab = tabs.find((t) => targets.includes(normalizeTitle(t.title)));
      return {
        plan_id: pl.id,
        plan_label: pl.label_ar ?? pl.label_en ?? "",
        tab_title: tab?.title ?? null,
        tab_gid: tab?.gid ?? null,
      };
    });

    return { tabs, matches };
  });

/** Import all matched tabs for a product in one shot. */
export const importAllTabsForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { productId: string; spreadsheetId: string; overrides?: Array<{ plan_id: string; tab_title: string }> }) => d,
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: plans, error: pErr } = await context.supabase
      .from("product_plans")
      .select("id, label_ar, label_en")
      .eq("product_id", data.productId);
    if (pErr) throw pErr;

    const infoRes = await gfetch(`${GATEWAY}/spreadsheets/${data.spreadsheetId}?fields=sheets.properties`, {
      headers: authHeaders(),
    });
    if (!infoRes.ok) {
      const t = await infoRes.text();
      throw new Error(`Google Sheets ${infoRes.status}: ${t}`);
    }
    const info = (await infoRes.json()) as {
      sheets?: Array<{ properties: { sheetId: number; title: string } }>;
    };
    const tabs = (info.sheets ?? []).map((s) => s.properties.title);

    const overrideMap = new Map<string, string>();
    (data.overrides ?? []).forEach((o) => overrideMap.set(o.plan_id, o.tab_title));

    // Save spreadsheet id on the product
    await context.supabase
      .from("products")
      .update({ google_spreadsheet_id: data.spreadsheetId })
      .eq("id", data.productId);

    const results: Array<{
      plan_id: string;
      plan_label: string;
      tab_title: string | null;
      inserted: number;
      skipped_existing: number;
      note?: string;
    }> = [];

    for (const pl of plans ?? []) {
      const targets = [normalizeTitle(pl.label_ar), normalizeTitle(pl.label_en)].filter(Boolean);
      let tabTitle = overrideMap.get(pl.id) ?? tabs.find((t) => targets.includes(normalizeTitle(t))) ?? null;

      if (!tabTitle) {
        results.push({
          plan_id: pl.id,
          plan_label: pl.label_ar ?? pl.label_en ?? "",
          tab_title: null,
          inserted: 0,
          skipped_existing: 0,
          note: "no_matching_tab",
        });
        continue;
      }

      // Fetch that tab's values
      const range = `${tabTitle}!A1:Z10000`;
      const valuesRes = await gfetch(`${GATEWAY}/spreadsheets/${data.spreadsheetId}/values/${range}`, {
        headers: authHeaders(),
      });
      if (!valuesRes.ok) {
        const t = await valuesRes.text();
        results.push({
          plan_id: pl.id,
          plan_label: pl.label_ar ?? pl.label_en ?? "",
          tab_title: tabTitle,
          inserted: 0,
          skipped_existing: 0,
          note: `fetch_failed_${valuesRes.status}: ${t.slice(0, 100)}`,
        });
        continue;
      }
      const vj = (await valuesRes.json()) as { values?: string[][] };
      const { records, statusColIdx } = mapSheetRows(vj.values ?? []);

      // Skip rows already sold/delivered on the sheet itself. We use a
      // blacklist of "not available" wordings (rather than a whitelist of
      // just the literal word "available") because status columns are
      // often in Arabic ("متاح" / "مباع" / "تم البيع" / ...) or use other
      // English synonyms -a whitelist-only check silently excluded every
      // row whose status didn't spell "available" exactly, which is what
      // made imports report "0 accounts imported" even for perfectly valid
      // files.
      const SOLD_STATUS_WORDS = [
        "sold",
        "delivered",
        "used",
        "taken",
        "issued",
        "expired",
        "مباع",
        "تمالبيع",
        "تمالتسليم",
        "مستخدم",
        "منتهي",
        "منتهيه",
        "محجوز",
      ];
      const availableRecords = records.filter(
        (r) => !r._statusValue || !SOLD_STATUS_WORDS.some((w) => r._statusValue.replace(/\s+/g, "").includes(w)),
      );

      if (availableRecords.length === 0) {
        results.push({
          plan_id: pl.id,
          plan_label: pl.label_ar ?? pl.label_en ?? "",
          tab_title: tabTitle,
          inserted: 0,
          skipped_existing: records.length - availableRecords.length,
          note: "no_available_rows",
        });
        continue;
      }

      const statusColLetter = statusColIdx >= 0 ? colIdxToLetter(statusColIdx) : null;
      const canSync = !!statusColLetter;

      // Build a content-key for each sheet row so add/remove reflects the file
      // regardless of row-index shifts when the user inserts/deletes rows.
      const rowKey = (r: {
        account_email: string | null;
        account_username: string | null;
        account_password: string | null;
        account_type: string | null;
        extra_notes: string | null;
      }) =>
        [
          (r.account_email ?? "").trim().toLowerCase(),
          (r.account_username ?? "").trim().toLowerCase(),
          (r.account_password ?? "").trim(),
          (r.account_type ?? "").trim().toLowerCase(),
          (r.extra_notes ?? "").trim().toLowerCase(),
        ].join("|");

      const sheetKeys = new Set(availableRecords.map(rowKey));

      // Load existing DB rows for this plan+spreadsheet+tab
      const { data: existing } = await context.supabase
        .from("account_inventory")
        .select("id, status, account_email, account_username, account_password, account_type, extra_notes")
        .eq("plan_id", pl.id)
        .eq("spreadsheet_id", data.spreadsheetId)
        .eq("sheet_title", tabTitle);

      const existingKeys = new Set((existing ?? []).map((e: any) => rowKey(e)));

      // Delete AVAILABLE DB rows that no longer exist in the sheet.
      // (Delivered/issued rows are kept -they represent a fulfilled order.)
      const toDeleteIds = (existing ?? [])
        .filter((e: any) => e.status === "available" && !sheetKeys.has(rowKey(e)))
        .map((e: any) => e.id);
      let removed = 0;
      if (toDeleteIds.length > 0) {
        const { error: delErr } = await context.supabase.from("account_inventory").delete().in("id", toDeleteIds);
        if (!delErr) removed = toDeleteIds.length;
      }

      const batchId = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

      const toInsert = availableRecords
        .filter((r) => !existingKeys.has(rowKey(r)))
        .map((r) => ({
          plan_id: pl.id,
          account_email: r.account_email,
          account_username: r.account_username,
          account_password: r.account_password,
          account_type: r.account_type,
          extra_notes: r.extra_notes,
          source: "sheet",
          import_batch_id: batchId,
          spreadsheet_id: canSync ? data.spreadsheetId : null,
          sheet_title: canSync ? tabTitle : null,
          sheet_row_index: canSync ? r._srcRowIndex : null,
          status_column_letter: canSync ? statusColLetter : null,
        }));

      let inserted = 0;
      if (toInsert.length > 0) {
        const { error: insErr } = await context.supabase.from("account_inventory").insert(toInsert);
        if (insErr) {
          results.push({
            plan_id: pl.id,
            plan_label: pl.label_ar ?? pl.label_en ?? "",
            tab_title: tabTitle,
            inserted: 0,
            skipped_existing: existingKeys.size,
            note: `insert_failed: ${insErr.message}`,
          });
          continue;
        }
        inserted = toInsert.length;
      }

      // Refresh plan stock
      const { count } = await context.supabase
        .from("account_inventory")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", pl.id)
        .eq("status", "available");
      await context.supabase
        .from("product_plans")
        .update({ stock: count ?? 0 })
        .eq("id", pl.id);

      results.push({
        plan_id: pl.id,
        plan_label: pl.label_ar ?? pl.label_en ?? "",
        tab_title: tabTitle,
        inserted,
        skipped_existing: availableRecords.length - toInsert.length,
        note: canSync ? (removed > 0 ? `removed_${removed}` : undefined) : "no_status_column_no_autosync",
      });
    }

    return { results };
  });
