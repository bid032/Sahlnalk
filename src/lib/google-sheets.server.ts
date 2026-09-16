/**
 * Google Sheets access via a Google Cloud service account.
 *
 * Env (any ONE of these):
 *   GOOGLE_SERVICE_ACCOUNT_JSON_B64  → base64 of the whole JSON key file  (BEST for cPanel)
 *   GOOGLE_SERVICE_ACCOUNT_JSON      → the raw JSON key file
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY
 *
 * Share every spreadsheet with the service account email (Editor).
 */

export const SHEETS_API = "https://sheets.googleapis.com/v4";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

type Creds = { email: string; privateKey: string };

let cachedToken: { token: string; exp: number } | null = null;

/**
 * Rebuilds a valid PEM even when the hosting panel destroyed the newlines
 * (cPanel often turns "\n" into "n" or strips the line breaks entirely).
 */
function normalizePrivateKey(input: string): string {
  let key = input.trim();
  // strip surrounding quotes some panels add
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");

  // Recover the base64 body no matter how mangled the whitespace is.
  const m = key.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/);
  if (!m) throw new Error("GOOGLE private_key: PEM header/footer missing or corrupted");
  const label = m[1];
  let body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  // cPanel bug: every "\n" became a literal "n" glued to the base64.
  if (!/\s/.test(m[2]) && body.length % 4 !== 0) body = body.replace(/n/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function getCreds(): Creds {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  const raw = b64 ? Buffer.from(b64, "base64").toString("utf8") : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let j: { client_email?: string; private_key?: string };
    try {
      j = JSON.parse(raw);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (the hosting panel probably mangled it -use GOOGLE_SERVICE_ACCOUNT_JSON_B64)");
    }
    if (!j.client_email || !j.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
    return { email: j.client_email, privateKey: normalizePrivateKey(j.private_key) };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !privateKey) {
    throw new Error("Google Sheets غير مُهيّأ: أضف GOOGLE_SERVICE_ACCOUNT_JSON_B64 أو GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY");
  }
  return { email, privateKey: normalizePrivateKey(privateKey) };
}

function b64url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const buf = Buffer.from(body, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function subtle() {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  const { webcrypto } = await import("node:crypto");
  return (webcrypto as unknown as Crypto).subtle;
}

async function mintAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const { email, privateKey } = getCreds();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claims}`;

  const s = await subtle();
  let key: CryptoKey;
  try {
    key = await s.importKey("pkcs8", pemToPkcs8(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch (e) {
    throw new Error(`Google private_key رفض الاستيراد (المفتاح غير صالح/مشوّه في متغيرات البيئة): ${String(e)}`);
  }
  const sig = await s.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** fetch() wrapper that adds the Google OAuth bearer token. */
export async function googleSheetsFetch(url: string, init: RequestInit = {}) {
  const token = await mintAccessToken();
  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers });
}

/** Diagnostic helper: call this from a temporary admin endpoint to see the real error. */
export async function googleSheetsSelfTest() {
  try {
    const { email } = getCreds();
    await mintAccessToken();
    return { ok: true as const, email };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}

/** True when service-account credentials are present. */
export function googleSheetsConfigured() {
  try {
    getCreds();
    return true;
  } catch {
    return false;
  }
}
