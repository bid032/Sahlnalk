/**
 * GoogleSheetsManager -Central registry for every Google Sheet the app uses.
 *
 * Server-only. Reads the `google_sheet_integrations` table (managed from
 * Admin ▸ Settings ▸ Integrations ▸ Google Sheets) and exposes a slug-based
 * lookup so app code never hardcodes a spreadsheet ID again.
 *
 * Example:
 *   const stock = await getSheetIntegration("stock");
 *   const url = `https://sheets.googleapis.com/v4/spreadsheets/${stock.spreadsheet_id}/values/${stock.worksheet_name}!A1:Z1000`;
 */

export type SheetIntegration = {
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

// No TTL cache: server functions run on stateless workers, so a stale cache on
// one instance made saved sheet links take minutes to apply. Always read fresh.
const CACHE_TTL_MS = 0;
let cache: { rows: SheetIntegration[]; exp: number } | null = null;

async function loadAll(): Promise<SheetIntegration[]> {
  const now = Date.now();
  if (cache && cache.exp > now) return cache.rows;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("google_sheet_integrations" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load Google Sheet integrations: ${error.message}`);
  const rows = (data ?? []) as unknown as SheetIntegration[];
  cache = { rows, exp: now + CACHE_TTL_MS };
  return rows;
}

/** Get every integration (enabled + disabled). Admin panel use. */
export async function listSheetIntegrations(): Promise<SheetIntegration[]> {
  return loadAll();
}

/**
 * Look up an integration by its slug. Returns only *enabled* rows.
 * Throws when the slug is missing or disabled -call sites can catch and
 * surface a clear "not configured" message.
 */
export async function getSheetIntegration(slug: string): Promise<SheetIntegration> {
  const rows = await loadAll();
  const row = rows.find((r) => r.slug === slug && r.enabled);
  if (!row) {
    throw new Error(
      `Google Sheets integration '${slug}' is not configured or is disabled. Add it in Admin ▸ Settings ▸ Integrations.`,
    );
  }
  return row;
}

/** Same as getSheetIntegration but returns null instead of throwing. */
export async function findSheetIntegration(slug: string): Promise<SheetIntegration | null> {
  const rows = await loadAll();
  return rows.find((r) => r.slug === slug && r.enabled) ?? null;
}

/** Force the next read to hit the database. Call after any write. */
export function invalidateSheetIntegrationsCache() {
  cache = null;
}

/* ---------------------------------------------------------------------- */
/*  Connection test                                                        */
/* ---------------------------------------------------------------------- */

export type ConnectionTestResult = {
  ok: boolean;
  spreadsheetFound: boolean;
  worksheetFound: boolean;
  canRead: boolean;
  canWrite: boolean;
  sheets: string[];
  serviceAccountEmail: string | null;
  error?: string;
};

const SHEETS_API = "https://sheets.googleapis.com/v4";

/**
 * Verify a spreadsheet + worksheet is reachable by the configured service
 * account, and that it has read + write access. Never reveals credentials
 * in the returned payload.
 */
export async function testSheetConnection(
  spreadsheetId: string,
  worksheetName: string,
): Promise<ConnectionTestResult> {
  const result: ConnectionTestResult = {
    ok: false,
    spreadsheetFound: false,
    worksheetFound: false,
    canRead: false,
    canWrite: false,
    sheets: [],
    serviceAccountEmail: null,
  };

  try {
    const { googleSheetsFetch, googleSheetsConfigured } = await import("@/lib/google-sheets.server");
    if (!googleSheetsConfigured()) {
      result.error = "GOOGLE_SERVICE_ACCOUNT_JSON غير مضبوط في متغيرات البيئة";
      return result;
    }

    // Extract service account email (from JSON, for the error message)
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (raw) {
        const j = JSON.parse(raw);
        result.serviceAccountEmail = j.client_email ?? null;
      }
    } catch { /* ignore */ }

    // 1) Metadata -spreadsheet + worksheet exist, read access granted
    const metaRes = await googleSheetsFetch(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    );
    if (metaRes.status === 403) {
      result.error = `Service Account مش عنده صلاحية على الشيت. شارك الشيت مع: ${result.serviceAccountEmail ?? "(unknown)"}`;
      return result;
    }
    if (metaRes.status === 404) {
      result.error = "Spreadsheet ID غير موجود";
      return result;
    }
    if (!metaRes.ok) {
      result.error = `Google API ${metaRes.status}: ${await metaRes.text()}`;
      return result;
    }
    result.spreadsheetFound = true;
    const meta = (await metaRes.json()) as {
      sheets?: Array<{ properties: { title: string } }>;
    };
    result.sheets = (meta.sheets ?? []).map((s) => s.properties.title);
    result.worksheetFound = result.sheets.includes(worksheetName);
    if (!result.worksheetFound) {
      result.error = `Worksheet "${worksheetName}" مش موجودة. الأوراق المتاحة: ${result.sheets.join(", ") || "(none)"}`;
      return result;
    }

    // 2) Read test -read a tiny range
    const readRes = await googleSheetsFetch(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(worksheetName)}!A1:A1`,
    );
    result.canRead = readRes.ok;
    if (!readRes.ok) {
      result.error = `فشل القراءة (${readRes.status})`;
      return result;
    }

    // 3) Write test -no-op batchUpdate (empty requests array)
    const writeRes = await googleSheetsFetch(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({ requests: [] }),
      },
    );
    result.canWrite = writeRes.ok;
    if (!writeRes.ok) {
      result.error = `صلاحية الكتابة مش متاحة (${writeRes.status}). شارك الشيت كـ Editor.`;
      return result;
    }

    result.ok = true;
    return result;
  } catch (e: any) {
    result.error = e?.message ?? String(e);
    return result;
  }
}
