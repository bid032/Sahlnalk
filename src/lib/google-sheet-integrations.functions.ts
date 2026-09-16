import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Guard: only admins may manage integrations. Throws otherwise. */
async function ensureAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

function normalizeSpreadsheetId(input: string): string {
  const raw = (input ?? "").trim();
  const m = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : raw;
}

function normalizeSlug(input: string): string {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** List every integration (admin panel). */
export const listGoogleSheetIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { listSheetIntegrations } = await import("@/lib/google-sheets-manager.server");
    return { rows: await listSheetIntegrations() };
  });

/** Create a new integration. */
export const createGoogleSheetIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    slug: string;
    description?: string | null;
    spreadsheet_id: string;
    worksheet_name: string;
    enabled?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = {
      name: data.name.trim(),
      slug: normalizeSlug(data.slug),
      description: (data.description ?? "").trim() || null,
      spreadsheet_id: normalizeSpreadsheetId(data.spreadsheet_id),
      worksheet_name: data.worksheet_name.trim(),
      enabled: data.enabled ?? true,
    };
    if (!payload.name || !payload.slug || !payload.spreadsheet_id || !payload.worksheet_name) {
      throw new Error("جميع الحقول (الاسم/المعرّف/Spreadsheet/Worksheet) مطلوبة");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("google_sheet_integrations" as any)
      .insert(payload as any)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("المعرّف أو الشيت مستخدم بالفعل");
      throw new Error(error.message);
    }
    const { invalidateSheetIntegrationsCache } = await import("@/lib/google-sheets-manager.server");
    invalidateSheetIntegrationsCache();
    return { row };
  });

/** Update an integration. */
export const updateGoogleSheetIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    name?: string;
    slug?: string;
    description?: string | null;
    spreadsheet_id?: string;
    worksheet_name?: string;
    enabled?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.slug !== undefined) patch.slug = normalizeSlug(data.slug);
    if (data.description !== undefined) patch.description = (data.description ?? "").trim() || null;
    if (data.spreadsheet_id !== undefined) patch.spreadsheet_id = normalizeSpreadsheetId(data.spreadsheet_id);
    if (data.worksheet_name !== undefined) patch.worksheet_name = data.worksheet_name.trim();
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("google_sheet_integrations" as any)
      .update(patch as any)
      .eq("id", data.id)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("المعرّف أو الشيت مستخدم بالفعل");
      throw new Error(error.message);
    }
    const { invalidateSheetIntegrationsCache } = await import("@/lib/google-sheets-manager.server");
    invalidateSheetIntegrationsCache();
    return { row };
  });

/** Delete an integration. */
export const deleteGoogleSheetIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_sheet_integrations" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { invalidateSheetIntegrationsCache } = await import("@/lib/google-sheets-manager.server");
    invalidateSheetIntegrationsCache();
    return { ok: true as const };
  });

/**
 * Test a spreadsheet + worksheet combo. Accepts either an existing integration ID
 * (uses its current stored values) or an ad-hoc pair (used before saving).
 */
export const testGoogleSheetIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; spreadsheet_id?: string; worksheet_name?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let spreadsheetId = data.spreadsheet_id ? normalizeSpreadsheetId(data.spreadsheet_id) : "";
    let worksheetName = data.worksheet_name?.trim() ?? "";
    if (data.id && (!spreadsheetId || !worksheetName)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("google_sheet_integrations" as any)
        .select("spreadsheet_id, worksheet_name")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Integration not found");
      spreadsheetId = spreadsheetId || (row as any).spreadsheet_id;
      worksheetName = worksheetName || (row as any).worksheet_name;
    }
    if (!spreadsheetId || !worksheetName) throw new Error("Spreadsheet ID و Worksheet مطلوبين");
    const { testSheetConnection } = await import("@/lib/google-sheets-manager.server");
    return await testSheetConnection(spreadsheetId, worksheetName);
  });
