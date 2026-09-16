import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://sheets.googleapis.com/v4";

/** fetch with Google service-account auth (no Lovable connector). */
async function gfetch(url: string, init: RequestInit = {}) {
  const { googleSheetsFetch } = await import("@/lib/google-sheets.server");
  return googleSheetsFetch(url, init);
}
const TABS = { PRODUCTS: "Products", STOCK: "Stock", ORDERS: "Orders", STAFF: "Staff" } as const;
const STOCK_COLUMNS = {
  STATUS: 5, // F
  ADDED_ON: 6, // G
  STAFF_NAME: 7, // H
  ORDER_ID: 8, // I
  ISSUE_TIME: 9, // J
  CUSTOMER_NAME: 10, // K
  OPERATION_TIME: 13, // N - New column for precise operation timestamp
} as const;

function authHeaders() {
  return { "Content-Type": "application/json" } as Record<string, string>;
}

async function getSpreadsheetId(): Promise<string> {
  // The link the admin pastes in Dashboard , Stock settings
  // (`site_settings.stock_sheet`) is the source of truth: whatever sheet is
  // saved there is exactly what the app reads. The integrations registry is
  // only a fallback for setups that never filled that field.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("site_settings").select("value").eq("key", "stock_sheet").maybeSingle();
  const cfg = (data?.value ?? {}) as { spreadsheet_id?: string };
  if (cfg.spreadsheet_id?.trim()) return cfg.spreadsheet_id.trim();

  try {
    const { findSheetIntegration } = await import("@/lib/google-sheets-manager.server");
    const it = await findSheetIntegration("stock");
    if (it?.spreadsheet_id) return it.spreadsheet_id;
  } catch {
    /* ignore , reported below */
  }
  throw new Error("لم يتم ربط شيت الاستوك بعد");
}


async function getAllSpreadsheetIds(): Promise<string[]> {
  const ids: string[] = [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // 1) The sheet(s) configured in the dashboard come first , they win on
  //    conflicts because that is where the admin pastes the live sheet link.
  const { data } = await supabaseAdmin.from("site_settings").select("value").eq("key", "stock_sheet").maybeSingle();
  const cfg = (data?.value ?? {}) as { spreadsheet_id?: string; extra_spreadsheet_ids?: string[] };
  if (cfg.spreadsheet_id?.trim()) ids.push(cfg.spreadsheet_id.trim());
  for (const id of cfg.extra_spreadsheet_ids ?? []) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  // 2) Registry: any integration whose slug starts with "stock"
  try {
    const { listSheetIntegrations } = await import("@/lib/google-sheets-manager.server");
    const rows = await listSheetIntegrations();
    for (const r of rows) {
      if (r.enabled && (r.slug === "stock" || r.slug.startsWith("stock-")) && !ids.includes(r.spreadsheet_id)) {
        ids.push(r.spreadsheet_id);
      }
    }
  } catch {
    /* ignore */
  }

  // 3) Every product-linked spreadsheet
  const { data: prods } = await supabaseAdmin
    .from("products")
    .select("google_spreadsheet_id")
    .not("google_spreadsheet_id", "is", null);
  for (const p of prods ?? []) {
    const id = (p as any).google_spreadsheet_id as string | null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function sheetsGet(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await gfetch(
    `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Sheets read ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { values?: unknown[][] };
  return (j.values ?? []).map((r) => r.map((c) => (c ?? "").toString()));
}

async function sheetsBatchUpdate(spreadsheetId: string, data: Array<{ range: string; values: (string | number)[][] }>) {
  const res = await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!res.ok) throw new Error(`Sheets batchUpdate ${res.status}: ${await res.text()}`);
}

async function sheetsAppend(spreadsheetId: string, range: string, values: (string | number)[][]) {
  const res = await gfetch(
    `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", headers: authHeaders(), body: JSON.stringify({ values }) },
  );
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${await res.text()}`);
}

function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}
function toBool(v: unknown) {
  if (v === true) return true;
  const t = String(v ?? "")
    .trim()
    .toLowerCase();
  return t === "true" || t === "1" || t === "yes" || t === "نعم";
}

export type StockProduct = {
  productId: string;
  productName: string;
  notes: string;
  unitLabel: string;
  isActive: boolean;
  availableCount: number;
  totalStock: number;
};

export type StockAppData = {
  products: StockProduct[];
  staffName: string;
  totalAvailable: number;
  lowStockCount: number;
  fetchedAt: string;
};

type CacheEntry = { at: number; data: StockAppData };
const APP_DATA_CACHE = new Map<string, CacheEntry>();
const APP_DATA_TTL_MS = 1000;

export const getStockAppData = createServerFn({ method: "GET" }).handler(async (): Promise<StockAppData> => {
  const { requireStockStaff } = await import("@/lib/stock-auth.server");
  const session = await requireStockStaff();

  const cacheKey = session.staffName || "_";
  const cached = APP_DATA_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < APP_DATA_TTL_MS) {
    return cached.data;
  }

  const spreadsheetId = await getSpreadsheetId();

  const [productsRaw, stockRaw] = await Promise.all([
    sheetsGet(spreadsheetId, `${TABS.PRODUCTS}!A1:H2000`),
    sheetsGet(spreadsheetId, `${TABS.STOCK}!A1:N20000`),
  ]);

  const summary = new Map<string, { available: number; total: number }>();
  for (let i = 1; i < stockRaw.length; i++) {
    const row = stockRaw[i];
    const productName = (row[1] ?? "").trim();
    const code = (row[2] ?? "").trim();
    const status = norm(row[5]);
    if (!productName || !code) continue;
    const s = summary.get(productName) ?? { available: 0, total: 0 };
    s.total += 1;
    if (status === "AVAILABLE") s.available += 1;
    summary.set(productName, s);
  }

  const products: StockProduct[] = [];
  for (let i = 1; i < productsRaw.length; i++) {
    const row = productsRaw[i];
    const productName = (row[1] ?? "").trim();
    const isActive = toBool(row[4]);
    if (!productName || !isActive) continue;
    const counts = summary.get(productName) ?? { available: 0, total: 0 };
    products.push({
      productId: (row[0] ?? "").trim(),
      productName,
      notes: (row[2] ?? "").trim(),
      unitLabel: (row[3] ?? "").trim(),
      isActive,
      availableCount: counts.available,
      totalStock: counts.total,
    });
  }
  products.sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

  const totalAvailable = products.reduce((s, p) => s + p.availableCount, 0);
  const lowStockCount = products.filter((p) => p.availableCount <= 3).length;

  const result: StockAppData = {
    products,
    staffName: session.staffName,
    totalAvailable,
    lowStockCount,
    fetchedAt: getEgyptISO(),
  };
  APP_DATA_CACHE.set(cacheKey, { at: Date.now(), data: result });
  return result;
});

export type IssueResult = {
  orderId: string;
  productName: string;
  qty: number;
  availableAfter: number;
  productNotes: string;
  unitLabel: string;
  codes: Array<{ code: string; extraInfo: string; displayText: string }>;
  displayText: string;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function colToLetter(col: number) {
  let s = "";
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}
function createOrderId() {
  const d = new Date();
  return `ORD-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function getEgyptDate() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function getEgyptISO() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export const issueStock = createServerFn({ method: "POST" })
  .inputValidator((d: { customerName: string; productName: string; qty: number; customerWhatsapp?: string }) => d)
  .handler(async ({ data }): Promise<IssueResult> => {
    const { requireStockStaff } = await import("@/lib/stock-auth.server");
    const session = await requireStockStaff();
    const staffName = session.staffName;
    const customerName = (data.customerName ?? "").trim();
    const productName = (data.productName ?? "").trim();
    const customerWhatsapp = (data.customerWhatsapp ?? "").trim();
    const qty = Number(data.qty || 0);

    if (!customerName) throw new Error("اكتب اسم العميل");
    if (!productName) throw new Error("اختر المنتج");
    if (!qty || qty < 1) throw new Error("الكمية لازم تكون 1 أو أكثر");

    const spreadsheetId = await getSpreadsheetId();
    const [productsRaw, stockRaw] = await Promise.all([
      sheetsGet(spreadsheetId, `${TABS.PRODUCTS}!A1:H2000`),
      sheetsGet(spreadsheetId, `${TABS.STOCK}!A1:N20000`),
    ]);

    let productNotes = "";
    let unitLabel = "";
    let isActive = false;
    for (let i = 1; i < productsRaw.length; i++) {
      const row = productsRaw[i];
      if ((row[1] ?? "").trim() === productName) {
        productNotes = (row[2] ?? "").trim();
        unitLabel = (row[3] ?? "").trim();
        isActive = toBool(row[4]);
        break;
      }
    }
    if (!isActive) throw new Error("المنتج غير موجود أو غير مفعل");

    const picks: Array<{ sheetRow: number; code: string; extraInfo: string; addedOnRaw: string }> = [];
    const targetNorm = norm(productName);
    for (let i = 1; i < stockRaw.length; i++) {
      const row = stockRaw[i];
      const rowProduct = norm(row[1]);
      const rowCode = (row[2] ?? "").trim();
      const rowStatus = norm(row[5]);
      if (rowProduct === targetNorm && rowStatus === "AVAILABLE" && rowCode) {
        picks.push({
          sheetRow: i + 1,
          code: rowCode,
          extraInfo: (row[3] ?? "").trim(),
          addedOnRaw: (row[6] ?? "").toString(),
        });
        if (picks.length === qty) break;
      }
    }
    if (picks.length < qty) throw new Error("المتاح أقل من الكمية المطلوبة");

    const orderId = createOrderId();
    const nowStr = getEgyptDate();
    const operationTime = getEgyptISO();
    const updates = picks.map((p) => ({
      range: `${TABS.STOCK}!F${p.sheetRow}:N${p.sheetRow}`,
      values: [["ISSUED", p.addedOnRaw, staffName, orderId, nowStr, customerName, "", "", operationTime]],
    }));
    // Write customer WhatsApp into any column named "Customer_Num" in the Stock sheet
    const stockHeader = stockRaw[0] ?? [];
    const stockCustNumIdx = stockHeader.findIndex((h) => norm(h) === "CUSTOMER_NUM");
    if (stockCustNumIdx >= 0 && customerWhatsapp) {
      const colLetter = colToLetter(stockCustNumIdx + 1);
      for (const p of picks) {
        updates.push({
          range: `${TABS.STOCK}!${colLetter}${p.sheetRow}`,
          values: [[customerWhatsapp]],
        });
      }
    }
    await sheetsBatchUpdate(spreadsheetId, updates);
    APP_DATA_CACHE.clear();

    const deliveredText = picks
      .map((p) => p.code)
      .filter(Boolean)
      .join("\n\n");
    // Orders: append base row, then patch Customer_Num column if it exists
    await sheetsAppend(spreadsheetId, `${TABS.ORDERS}!A1`, [
      [
        orderId,
        nowStr,
        staffName,
        customerName,
        productName,
        qty,
        deliveredText,
        productNotes,
        "DONE",
        customerWhatsapp,
      ],
    ]);
    if (customerWhatsapp) {
      try {
        const ordersHeader = (await sheetsGet(spreadsheetId, `${TABS.ORDERS}!A1:Z1`))[0] ?? [];
        const ordersCustNumIdx = ordersHeader.findIndex((h) => norm(h) === "CUSTOMER_NUM");
        if (ordersCustNumIdx >= 0) {
          const ordersAll = await sheetsGet(spreadsheetId, `${TABS.ORDERS}!A1:A20000`);
          let targetRow = -1;
          for (let i = ordersAll.length - 1; i >= 1; i--) {
            if ((ordersAll[i][0] ?? "").trim() === orderId) {
              targetRow = i + 1;
              break;
            }
          }
          if (targetRow > 0) {
            await sheetsBatchUpdate(spreadsheetId, [
              {
                range: `${TABS.ORDERS}!${colToLetter(ordersCustNumIdx + 1)}${targetRow}`,
                values: [[customerWhatsapp]],
              },
            ]);
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    let availableAfter = 0;
    for (let i = 1; i < stockRaw.length; i++) {
      const row = stockRaw[i];
      if (norm(row[1]) === targetNorm && norm(row[5]) === "AVAILABLE" && (row[2] ?? "").trim()) {
        availableAfter++;
      }
    }
    availableAfter -= picks.length;

    const codes = picks.map((p) => ({
      code: p.code,
      extraInfo: p.extraInfo,
      displayText: p.extraInfo ? `${p.code}\nPassword: ${p.extraInfo}` : p.code,
    }));

    return {
      orderId,
      productName,
      qty,
      availableAfter: Math.max(0, availableAfter),
      productNotes,
      unitLabel,
      codes,
      displayText: codes.map((c) => c.displayText).join("\n\n"),
    };
  });

export const revertIssue = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data }): Promise<{ orderId: string; itemCount: number }> => {
    await (await import("@/lib/stock-auth.server")).requireStockStaff();
    const orderId = (data.orderId ?? "").trim();
    if (!orderId) throw new Error("رقم العملية غير موجود");

    const spreadsheetId = await getSpreadsheetId();
    const stockRaw = await sheetsGet(spreadsheetId, `${TABS.STOCK}!A1:N20000`);

    const reverts: Array<{ sheetRow: number; addedOnRaw: string }> = [];
    for (let i = 1; i < stockRaw.length; i++) {
      const row = stockRaw[i];
      const rowOrderId = (row[8] ?? "").trim();
      const rowStatus = norm(row[5]);
      const rowCode = (row[2] ?? "").trim();
      if (rowOrderId === orderId && rowStatus === "ISSUED" && rowCode) {
        reverts.push({ sheetRow: i + 1, addedOnRaw: (row[6] ?? "").toString() });
      }
    }
    if (!reverts.length) throw new Error("لا توجد أكواد مصروفة بهذا الرقم أو تم إرجاعها بالفعل");

    const operationTime = getEgyptISO();
    const updates = reverts.map((r) => ({
      range: `${TABS.STOCK}!F${r.sheetRow}:N${r.sheetRow}`,
      values: [["AVAILABLE", r.addedOnRaw, "", "", "", "", "", "", operationTime]],
    }));
    await sheetsBatchUpdate(spreadsheetId, updates);
    APP_DATA_CACHE.clear();

    const ordersRaw = await sheetsGet(spreadsheetId, `${TABS.ORDERS}!A1:J20000`);
    for (let i = 1; i < ordersRaw.length; i++) {
      if ((ordersRaw[i][0] ?? "").trim() === orderId) {
        await sheetsBatchUpdate(spreadsheetId, [{ range: `${TABS.ORDERS}!I${i + 1}`, values: [["REVERTED"]] }]);
        break;
      }
    }

    return { orderId, itemCount: reverts.length };
  });

// ============================================================
// Duplicate code detector across tabs and linked spreadsheets
// ============================================================

async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  const res = await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=sheets.properties(title)`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Sheets meta ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (j.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

async function getSpreadsheetTitle(spreadsheetId: string): Promise<string> {
  const res = await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=properties.title`, {
    headers: authHeaders(),
  });
  if (!res.ok) return spreadsheetId.slice(0, 8);
  const j = (await res.json()) as { properties?: { title?: string } };
  return j.properties?.title ?? spreadsheetId.slice(0, 8);
}

export type DuplicateLocation = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  tab: string;
  row: number;
};

export type DuplicateGroup = {
  code: string;
  count: number;
  locations: DuplicateLocation[];
  crossTab: boolean; // appears in more than one tab or file
  crossFile: boolean; // appears in more than one spreadsheet file
};

export type DuplicatesResult = {
  scannedAt: string;
  scannedFiles: number;
  scannedTabs: number;
  totalCodes: number;
  duplicateCount: number;
  groups: DuplicateGroup[];
};

let DUPES_CACHE: { at: number; data: DuplicatesResult } | null = null;
const DUPES_TTL_MS = 5 * 60_000; // 5 minutes -this is a big scan

/** Values that are obviously placeholders / flags, never real credentials. */
const DUPE_SKIP_EXACT = new Set([
  "TEST",
  "DEMO",
  "SAMPLE",
  "EXAMPLE",
  "NONE",
  "NULL",
  "NIL",
  "N/A",
  "NA",
  "TBD",
  "XXX",
  "XXXX",
  "UNKNOWN",
  "EMPTY",
  "PLACEHOLDER",
  "TESTTEST",
  "ABCDEFG",
  "123",
  "-",
  "--",
  "---",
  "0",
  // Arabic placeholders
  "تجربة",
  "اختبار",
  "فارغ",
  "لا يوجد",
  "بدون",
  // Stray header cells that sometimes repeat as body rows
  "EMAIL",
  "E-MAIL",
  "MAIL",
  "USERNAME",
  "USER",
  "PASSWORD",
  "PASS",
  "PWD",
  "CODE",
  "KEY",
  "SERIAL",
  "LICENSE",
  "LICENCE",
  "LOGIN",
  "ACCOUNT",
  "STATUS",
  "NOTES",
  "ايميل",
  "باسورد",
  "كود",
  "مفتاح",
  "الحالة",
  "ملاحظات",
]);

/**
 * Normalize a credential for duplicate comparison:
 * - strip invisible chars (BOM / zero-width) that Sheets loves to inject
 * - trim + uppercase (codes & passwords are case-insensitive in practice)
 * - collapse separators (spaces / dashes / underscores) so "AB 12-CD"
 *   and "ab12_cd" correctly match as the same code
 */
function normalizeDupeValue(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");
}

function isDupeWorthy(value: string): boolean {
  if (value.length < 4) return false; // flags / single digits, not credentials
  if (DUPE_SKIP_EXACT.has(value)) return false;
  if (/^(.)\1{3,}$/.test(value)) return false; // "XXXX", "0000", "...."
  return true;
}

async function scanDuplicates(force = false): Promise<DuplicatesResult> {
  if (!force && DUPES_CACHE && Date.now() - DUPES_CACHE.at < DUPES_TTL_MS) {
    return DUPES_CACHE.data;
  }

  const ids = await getAllSpreadsheetIds();
  if (!ids.length) throw new Error("لم يتم ربط شيت الاستوك بعد");

  const map = new Map<string, DuplicateLocation[]>();
  let scannedTabs = 0;
  let totalCodes = 0;

  for (const spreadsheetId of ids) {
    let titles: string[] = [];
    let bookTitle = spreadsheetId.slice(0, 8);
    try {
      [titles, bookTitle] = await Promise.all([listSheetTitles(spreadsheetId), getSpreadsheetTitle(spreadsheetId)]);
    } catch {
      continue;
    }

    for (const tab of titles) {
      const t = tab.trim().toLowerCase();
      if (["products", "orders", "staff", "settings", "config", "log", "logs"].includes(t)) continue;

      let rows: string[][] = [];
      try {
        rows = await sheetsGet(spreadsheetId, `${tab}!A1:Z20000`);
      } catch {
        continue;
      }
      if (rows.length < 2) continue;
      scannedTabs += 1;

      const header = (rows[0] ?? []).map((h) => (h ?? "").trim().toLowerCase());
      // Only scan columns that clearly hold delivery credentials -activation
      // keys / codes / licenses / emails / usernames / passwords. Skip any
      // other columns (product name, notes, status, dates, staff, order id,
      // customer info, etc.) so unrelated repeats don't get flagged.
      const KEY_HEADERS = [
        "code",
        "codes",
        "activation",
        "activation code",
        "activation key",
        "key",
        "keys",
        "license",
        "licence",
        "license key",
        "serial",
        "serial number",
        "email",
        "e-mail",
        "mail",
        "gmail",
        "username",
        "user name",
        "user",
        "login",
        "account",
        "password",
        "pass",
        "pwd",
        "كود",
        "الكود",
        "مفتاح",
        "مفتاح التفعيل",
        "التفعيل",
        "سيريال",
        "ايميل",
        "إيميل",
        "البريد",
        "بريد",
        "بريد الكتروني",
        "يوزر",
        "يوزرنيم",
        "اسم المستخدم",
        "المستخدم",
        "باسورد",
        "الباسورد",
        "كلمة السر",
        "كلمة المرور",
      ];
      const keyCols: number[] = [];
      header.forEach((h, idx) => {
        if (!h) return;
        // Substring match so headers like "activation_key", "Email Address",
        // "user password", "كود التفعيل"… all get picked up.
        if (KEY_HEADERS.some((k) => h.includes(k))) keyCols.push(idx);
      });
      if (keyCols.length === 0) continue;

      // Track duplicates within the same tab+column (row indices) so we
      // don't double-count when the same code repeats in the same cell path.
      const seenInTab = new Set<string>();
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        for (const c of keyCols) {
          const raw = row[c] ?? "";
          if (!raw.trim()) continue;
          const norm = normalizeDupeValue(raw);
          // Key by the NORMALIZED value only (not by column) so the same
          // code counts as a duplicate even if it appears under different
          // header names, with different separators/casing, or in a
          // different tab / spreadsheet. Junk / placeholder values are
          // skipped so they never raise false alarms.
          if (!isDupeWorthy(norm)) continue;
          const dedupKey = `${spreadsheetId}::${tab}::${c}::${i}`;
          if (seenInTab.has(dedupKey)) continue;
          seenInTab.add(dedupKey);
          totalCodes += 1;
          const arr = map.get(norm) ?? [];
          arr.push({ spreadsheetId, spreadsheetTitle: bookTitle, tab, row: i + 1 });
          map.set(norm, arr);
        }
      }
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [code, locations] of map) {
    if (locations.length < 2) continue;
    const tabs = new Set(locations.map((l) => `${l.spreadsheetId}::${l.tab}`));
    const files = new Set(locations.map((l) => l.spreadsheetId));
    groups.push({
      code,
      count: locations.length,
      // Cap stored locations per group so one wildly-repeated placeholder
      // that slips through can never blow up the payload.
      locations: locations.slice(0, 25),
      crossTab: tabs.size > 1,
      crossFile: files.size > 1,
    });
  }
  // Most dangerous first: cross-file dupes (double-delivery risk), then
  // cross-tab, then by repeat count.
  groups.sort((a, b) => {
    if (a.crossFile !== b.crossFile) return a.crossFile ? -1 : 1;
    if (a.crossTab !== b.crossTab) return a.crossTab ? -1 : 1;
    return b.count - a.count;
  });

  const result: DuplicatesResult = {
    scannedAt: new Date().toISOString(),
    scannedFiles: ids.length,
    scannedTabs,
    totalCodes,
    duplicateCount: groups.length,
    groups: groups.slice(0, 200),
  };
  DUPES_CACHE = { at: Date.now(), data: result };
  return result;
}

export const getStockDuplicates = createServerFn({ method: "GET" }).handler(async (): Promise<DuplicatesResult> => {
  await (await import("@/lib/stock-auth.server")).requireStockStaff();
  return scanDuplicates();
});

export const getInventoryDuplicatesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { force?: boolean } | undefined) => input ?? {})
  .handler(async ({ context, data }): Promise<DuplicatesResult> => {
    const [{ data: isAdmin }, { data: isMod }] = await Promise.all([
      (context as any).supabase.rpc("has_role", { _user_id: (context as any).userId, _role: "admin" }),
      (context as any).supabase.rpc("has_role", { _user_id: (context as any).userId, _role: "moderator" }),
    ]);
    if (!isAdmin && !isMod) {
      const err: any = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    return scanDuplicates(!!data?.force);
  });

// Back-compat

export const getStockData = getStockAppData;
