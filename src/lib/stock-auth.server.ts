export type StockSessionData = {
  staffName?: string;
  loggedAt?: number;
  exp?: number;
};

const COOKIE_NAME = "rk-stock-session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

async function hmac(value: string) {
  const { createHmac } = await import("node:crypto");
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", password).update(value, "utf8").digest("base64url");
}

function parseCookies(cookieHeader: string | null | undefined) {
  const cookies = new Map<string, string>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

export async function createStockSessionValue(staffName: string) {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ staffName, loggedAt: now, exp: now + MAX_AGE_SECONDS * 1000 }),
    "utf8",
  ).toString("base64url");
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function readStockSessionFromCookieHeader(cookieHeader: string | null | undefined): Promise<StockSessionData> {
  const value = parseCookies(cookieHeader).get(COOKIE_NAME);
  if (!value) return {};
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return {};
  const expected = await hmac(payload);
  if (sig !== expected) return {};
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StockSessionData;
    if (!data.staffName || !data.exp || data.exp < Date.now()) return {};
    return { staffName: data.staffName, loggedAt: data.loggedAt, exp: data.exp };
  } catch {
    return {};
  }
}

function getCookieAttributes(requestUrl?: string | URL) {
  const secure = requestUrl ? new URL(requestUrl).protocol === "https:" : process.env.NODE_ENV === "production";
  // Lovable preview runs the site inside an iframe, so Lax cookies are not sent
  // with server-function fetches there. SameSite=None requires Secure, so keep
  // Lax only for local http development.
  return `${secure ? "SameSite=None; Secure" : "SameSite=Lax"}`;
}

export function stockSessionSetCookie(value: string, requestUrl?: string | URL) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; ${getCookieAttributes(requestUrl)}`;
}

export function stockSessionClearCookie(requestUrl?: string | URL) {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; ${getCookieAttributes(requestUrl)}`;
}

export function getSessionConfig() {
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

export async function readStockSession(): Promise<StockSessionData> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return readStockSessionFromCookieHeader(getRequestHeader("cookie"));
}

export async function requireStockStaff(): Promise<Required<Pick<StockSessionData, "staffName">> & StockSessionData> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const auth = getRequestHeader("authorization") || getRequestHeader("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    const err: any = new Error("Unauthorized"); err.statusCode = 401; throw err;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userRes.user) {
    const err: any = new Error("Unauthorized"); err.statusCode = 401; throw err;
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, stock_access")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (!profile?.stock_access) {
    const err: any = new Error("Forbidden: no stock access"); err.statusCode = 403; throw err;
  }
  const staffName = profile.display_name || userRes.user.email || "Staff";
  return { staffName, loggedAt: Date.now(), exp: Date.now() + MAX_AGE_SECONDS * 1000 };
}
