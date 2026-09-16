import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Header } from "@/components/Header";
import { useApp } from "@/contexts/AppContext";
import { SiteButton } from "@/components/ui/site-button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/error-handler";
import { ARAB_COUNTRIES, dialForCountry } from "@/lib/arab-countries";
import { filterName, filterDigits, filterEmail } from "@/lib/input-filters";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "تسجيل الدخول | سهلنالك" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useApp();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirect ?? "/dashboard" });
    });
  }, [navigate, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setInfo(`بعتنا رابط الاستعادة على ${email} - افتح إيميلك وكمّل منه.`);
        return;
      }
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name, phone, country },
          },
        });
        if (err) throw err;
        // Persist phone + country onto profile (trigger creates the row already)
        if (data.user) {
          await supabase
            .from("profiles")
            .update({ display_name: name, phone, country })
            .eq("id", data.user.id);
        }
        if (!data.session) {
          setInfo(
            `بعتنا رابط التأكيد على ${email} - افتح إيميلك ودوس عليه عشان حسابك يتفعل.`,
          );
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      navigate({ to: redirect ?? "/dashboard" });
    } catch (err: any) {
      console.error("auth failed", err);
      setError(friendlyErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  // Google sign-in now runs through Google Identity Services on our own
  // domain (see components/GoogleSignInButton.tsx), so the consent screen
  // says "Continue to rapidkeyz.com" instead of the Supabase project URL.

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="max-w-md mx-auto px-3 sm:px-6 py-10 sm:py-16">
        <div className="bg-card border border-border rounded-2xl p-8">
          <h1 className="text-2xl font-extrabold mb-2">{t.auth.welcome}</h1>
          <p className="text-muted-foreground text-sm mb-6">{t.auth.welcomeDesc}</p>

          <div className="flex bg-muted rounded-full p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${mode === "signin"
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {t.auth.signIn}
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${mode === "signup"
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {t.auth.signUp}
            </button>
          </div>

          <GoogleSignInButton
            onSuccess={() => navigate({ to: redirect ?? "/dashboard" })}
            onError={(message) => setError(message)}
            fallbackRedirectTo={`${typeof window !== "undefined" ? window.location.origin : ""}${redirect ?? "/dashboard"
              }`}
          />

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t.auth.or}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <input
                  required
                  placeholder={lang === "ar" ? "الاسم بالكامل" : "Full name"}
                  value={name}
                  onChange={(e) => setName(filterName(e.target.value))}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg"
                />
                <select
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg"
                >
                  <option value="">{lang === "ar" ? "اختر الدولة" : "Select country"}</option>
                  {ARAB_COUNTRIES.map((c) => (
                    <option key={c.code} value={lang === "ar" ? c.ar : c.en}>
                      {lang === "ar" ? c.ar : c.en} (+{c.dial})
                    </option>
                  ))}
                </select>
                <div
                  dir="ltr"
                  className="flex items-stretch rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-brand/40"
                >
                  <span className="px-3 grid place-items-center bg-muted text-sm font-mono font-bold text-muted-foreground select-none shrink-0 border-e border-border">
                    +{dialForCountry(country)}
                  </span>
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    placeholder={lang === "ar" ? "رقم الواتساب" : "WhatsApp number"}
                    value={phone}
                    onChange={(e) => setPhone(filterDigits(e.target.value, 15))}
                    className="flex-1 min-w-0 px-4 py-3 bg-transparent outline-none text-start placeholder:text-end"
                    dir="ltr"
                  />
                </div>
              </>
            )}
            <input
              required
              type="email"
              placeholder={t.auth.email}
              value={email}
              onChange={(e) => setEmail(filterEmail(e.target.value))}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg"
            />
            {mode !== "forgot" && (
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  minLength={6}
                  placeholder={t.auth.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pe-12 bg-background border border-border rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            )}
            {mode === "signin" && (
              <div className="text-start rtl:text-end">
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-xs font-bold text-brand hover:underline"
                >
                  نسيت كلمة السر؟ / Forgot password?
                </button>
              </div>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
            {info && (
              <p className="text-success text-sm bg-success/10 border border-success/30 rounded-lg p-3">
                {info}
              </p>
            )}
            <SiteButton
              variant="primary"
              size="lg"
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading
                ? t.common.loading
                : mode === "signin"
                  ? t.auth.signIn
                  : mode === "signup"
                    ? t.auth.signUp
                    : "إرسال رابط الاستعادة / Send reset link"}
            </SiteButton>
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="w-full text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                ← ارجع لتسجيل الدخول / Back to sign in
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
