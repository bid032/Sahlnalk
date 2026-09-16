import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { friendlyErrorMessage } from "@/lib/error-handler";
import {
  GOOGLE_CLIENT_ID,
  createNoncePair,
  googleIdentityEnabled,
  loadGoogleIdentity,
} from "@/lib/google-identity";

type Props = {
  /** Called after a successful sign-in. */
  onSuccess: () => void;
  onError: (message: string) => void;
  /** Where Supabase should return the user when we fall back to the redirect flow. */
  fallbackRedirectTo: string;
};

/**
 * Google sign-in button that keeps the site's own styling.
 *
 * The real Google button (GIS) is rendered on top of our styled button but kept
 * fully transparent, so the user sees the Sahlnalk design while Google gets a
 * genuine user gesture on its own iframe. Google returns an ID token straight to
 * this domain, which we exchange with Supabase -so the consent screen reads
 * "Continue to rapidkeyz.com" instead of the Supabase project domain.
 *
 * If `VITE_GOOGLE_CLIENT_ID` is missing or the GIS script is blocked, the button
 * silently falls back to the classic Supabase OAuth redirect.
 */
export function GoogleSignInButton({ onSuccess, onError, fallbackRedirectTo }: Props) {
  const { t, lang } = useApp();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  const handleCredential = useCallback(
    async (credential: string, nonce: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: credential,
          nonce,
        });
        if (error) throw error;

        // Keep the profile row in sync with the Google account details.
        const user = data.user;
        if (user) {
          const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
          const displayName =
            (meta["full_name"] as string | undefined) ??
            (meta["name"] as string | undefined) ??
            null;
          if (displayName) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", user.id)
              .maybeSingle();
            if (profile && !profile.display_name) {
              await supabase
                .from("profiles")
                .update({ display_name: displayName })
                .eq("id", user.id);
            }
          }
        }
        onSuccess();
      } catch (err: any) {
        console.error("google id-token sign-in failed", err);
        onError(friendlyErrorMessage(err, lang));
      } finally {
        setLoading(false);
      }
    },
    [lang, onError, onSuccess]
  );

  // Initialise GIS and render the invisible Google button on top of ours.
  useEffect(() => {
    if (!googleIdentityEnabled()) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    (async () => {
      try {
        const [gid, nonce] = await Promise.all([loadGoogleIdentity(), createNoncePair()]);
        if (cancelled || !overlayRef.current) return;

        gid.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          callback: (res) => void handleCredential(res.credential, nonce.raw),
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          ux_mode: "popup",
          context: "signin",
        });

        const draw = () => {
          const overlay = overlayRef.current;
          const width = wrapperRef.current?.offsetWidth ?? 0;
          if (!overlay || width === 0) return;
          overlay.innerHTML = "";
          gid.renderButton(overlay, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "center",
            locale: lang === "ar" ? "ar" : "en",
            width: Math.min(400, Math.round(width)),
          });
        };

        draw();
        setGisReady(true);

        if (wrapperRef.current && typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(draw);
          observer.observe(wrapperRef.current);
        }
      } catch (err) {
        // Script blocked (ad-blocker / offline): keep the redirect fallback.
        console.warn("google identity unavailable, using redirect fallback", err);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [handleCredential, lang]);

  // Classic Supabase redirect flow -used when GIS is not available.
  const handleFallback = async () => {
    if (gisReady) return; // the transparent Google button handles the click
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: fallbackRedirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      console.error("google oauth failed", error);
      onError(friendlyErrorMessage(error, lang));
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full mb-4">
      <button
        type="button"
        onClick={handleFallback}
        disabled={loading}
        aria-busy={loading}
        className="w-full px-4 py-3 border border-border rounded-lg font-bold hover:bg-muted transition flex items-center justify-center gap-3 disabled:opacity-60"
      >
        {loading ? (
          <span className="size-5 rounded-full border-2 border-border border-t-transparent animate-spin" />
        ) : (
          <svg className="size-5" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.4 35.8 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"
            />
          </svg>
        )}
        {t.auth.google}
      </button>

      {/* Real Google button: invisible, sits exactly on top of ours. */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        dir="ltr"
        className={`absolute inset-0 flex items-center justify-center overflow-hidden opacity-0 ${gisReady && !loading ? "" : "pointer-events-none"
          }`}
        style={{ colorScheme: "light" }}
      />
    </div>
  );
}
