import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://sheets.googleapis.com/v4";

/** fetch with Google service-account auth (no Lovable connector). */
async function gfetch(url: string, init: RequestInit = {}) {
  const { googleSheetsFetch } = await import("@/lib/google-sheets.server");
  return googleSheetsFetch(url, init);
}
const STAFF_TAB = "Staff";

export type StaffRecord = {
  name: string;
  username: string;
  password: string;
  active: boolean;
};

function authHeaders() {
  return { "Content-Type": "application/json" } as Record<string, string>;
}

async function getSpreadsheetId(): Promise<string> {
  // Prefer the registry (slug = "staff" for the staff sheet, falls back to "stock").
  try {
    const { findSheetIntegration } = await import("@/lib/google-sheets-manager.server");
    const it = (await findSheetIntegration("staff")) ?? (await findSheetIntegration("stock"));
    if (it?.spreadsheet_id) return it.spreadsheet_id;
  } catch { /* ignore */ }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("site_settings").select("value").eq("key", "stock_sheet").maybeSingle();
  const cfg = (data?.value ?? {}) as { spreadsheet_id?: string };
  if (!cfg.spreadsheet_id) throw new Error("لم يتم ربط شيت الاستوك بعد");
  return cfg.spreadsheet_id;
}

async function sheetsGet(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await gfetch(
    `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Sheets read ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { values?: unknown[][] };
  return (j.values ?? []).map((r) => r.map((c) => (c ?? "").toString()));
}

function toBool(v: unknown, defaultTrue = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return defaultTrue;
  return s === "true" || s === "1" || s === "yes" || s === "نعم" || s === "y";
}

/**
 * Read staff from sheet columns A:E. Skips header row.
 * Legacy sheets may have a WhatsApp column in D (now ignored); Active can be in D or E.
 */
export async function fetchStaffFromSheet(): Promise<StaffRecord[]> {
  const spreadsheetId = await getSpreadsheetId();
  const rows = await sheetsGet(spreadsheetId, `${STAFF_TAB}!A1:E1000`);
  const out: StaffRecord[] = [];
  let activeCol = 3; // default: column D
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[0] ?? "").trim();
    if (i === 0) {
      // header detection + locate Active column (supports legacy WhatsApp in D)
      const headerLike = /^(name|الاسم|staff|موظف)$/i.test(name);
      const idxByE = String(row[4] ?? "").trim().toLowerCase();
      const idxByD = String(row[3] ?? "").trim().toLowerCase();
      if (idxByE === "active" || idxByE === "مفعّل" || idxByE === "مفعل") activeCol = 4;
      else if (idxByD === "active" || idxByD === "مفعّل" || idxByD === "مفعل") activeCol = 3;
      if (headerLike) continue;
    }
    if (!name) continue;
    out.push({
      name,
      username: (row[1] ?? "").trim(),
      password: (row[2] ?? "").trim(),
      active: toBool(row[activeCol], true),
    });
  }
  return out;
}

async function eqHash(a: string, b: string) {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}

export async function verifyStaffPassword(inputPassword: string, storedPassword: string) {
  return eqHash(inputPassword, storedPassword || "___never_matches___");
}

/** PUBLIC: login with username + password against Staff sheet. */
export const stockLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const username = (data.username ?? "").trim().toLowerCase();
    const password = String(data.password ?? "");
    if (!username || !password) {
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false as const, error: "أدخل اسم المستخدم وكلمة السر" };
    }
    let staff: StaffRecord[];
    try {
      staff = await fetchStaffFromSheet();
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "تعذر الاتصال بالشيت" };
    }
    const match = staff.find((s) => s.username && s.username.toLowerCase() === username && s.active);
    const ok = !!match && await verifyStaffPassword(password, match.password);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false as const, error: "بيانات الدخول غير صحيحة" };
    }
    const { createStockSessionValue, stockSessionSetCookie } = await import("@/lib/stock-auth.server");
    const { setResponseHeader, getRequestUrl } = await import("@tanstack/react-start/server");
    const sessionValue = await createStockSessionValue(match!.name);
    setResponseHeader("Set-Cookie", stockSessionSetCookie(sessionValue, getRequestUrl()));
    return { ok: true as const, staffName: match!.name };
  });

/** PUBLIC: log out from stock session. */
export const stockLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { stockSessionClearCookie } = await import("@/lib/stock-auth.server");
  const { setResponseHeader, getRequestUrl } = await import("@tanstack/react-start/server");
  setResponseHeader("Set-Cookie", stockSessionClearCookie(getRequestUrl()));
  return { ok: true as const };
});

/** PUBLIC: read current stock session (safe fields only). */
export const getStockSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readStockSession } = await import("@/lib/stock-auth.server");
  const data = await readStockSession();
  if (!data.staffName) return { loggedIn: false as const };
  return { loggedIn: true as const, staffName: data.staffName };
});

function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not configured");
  return {
    password,
    name: "rk-stock-session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}
