/**
 * Google Identity Services (GIS) helper.
 *
 * Why this exists:
 * Signing in through `supabase.auth.signInWithOAuth({ provider: "google" })`
 * sends the user to `https://<project-ref>.supabase.co/auth/v1/callback`, so the
 * Google consent screen says "Continue to <project-ref>.supabase.co".
 *
 * With GIS we ask Google for an **ID token** directly from our own domain and
 * hand it to `supabase.auth.signInWithIdToken()`. Google then shows
 * "Continue to rapidkeyz.com" (the Authorized JavaScript origin), and no
 * Supabase custom domain / paid add-on is needed.
 *
 * Requires `VITE_GOOGLE_CLIENT_ID` (the Web OAuth client id from Google Cloud).
 */

export const GOOGLE_CLIENT_ID: string =
  (import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined) ?? "";

export function googleIdentityEnabled(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisPromise: Promise<typeof window.google.accounts.id> | null = null;

/** Loads the GIS script once and resolves with `google.accounts.id`. */
export function loadGoogleIdentity(): Promise<typeof window.google.accounts.id> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("google identity is browser-only"));
  }
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error("google identity failed to initialise"));
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", () => reject(new Error("google identity script blocked")));
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return gisPromise;
}

/**
 * Creates a nonce pair: the raw value goes to Supabase, the SHA-256 hash goes
 * to Google. Supabase re-hashes the raw value and compares, which prevents an
 * ID token issued for another page from being replayed here.
 */
export async function createNoncePair(): Promise<{ raw: string; hashed: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return { raw, hashed };
}

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce?: string;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            context?: "signin" | "signup" | "use";
            ux_mode?: "popup" | "redirect";
            itp_support?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
              locale?: string;
            }
          ) => void;
          prompt: (listener?: (notification: unknown) => void) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
