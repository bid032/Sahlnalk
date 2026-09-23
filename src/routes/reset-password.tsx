import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/error-handler";
import { useApp } from "@/contexts/AppContext";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "سهلنالك | إعادة تعيين كلمة المرور" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});


function ResetPasswordPage() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and emits a PASSWORD_RECOVERY event
    // or sets a session. Wait for either before enabling the form.
    let mounted = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    check();
    // Give the SDK a moment to process the hash even without an event
    const to = setTimeout(check, 800);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(to);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6)
      return setError(lang === "ar" ? "كلمة السر لازم تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
    if (password !== confirm)
      return setError(lang === "ar" ? "كلمتا السر غير متطابقتين" : "Passwords do not match");
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setInfo(lang === "ar" ? "تم تحديث كلمة السر بنجاح. جاري تحويلك..." : "Password updated successfully. Redirecting...");
      setTimeout(() => navigate({ to: "/dashboard" }), 1200);
    } catch (err: any) {
      console.error("reset password failed", err);
      setError(friendlyErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="bg-card border border-border rounded-2xl p-8">
          <h1 className="text-2xl font-extrabold mb-2">إعادة تعيين كلمة السر</h1>
          <p className="text-muted-foreground text-sm mb-6">
            اكتب كلمة سر جديدة لحسابك.
          </p>

          {!ready ? (
            <p className="text-sm text-muted-foreground">
              جاري التحقق من رابط الاستعادة...
              <br />
              لو الرابط منتهي الصلاحية اطلب رابط جديد من صفحة تسجيل الدخول.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <PasswordField
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                placeholder="كلمة السر الجديدة"
              />
              <PasswordField
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                placeholder="تأكيد كلمة السر"
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
              {info && (
                <p className="text-success text-sm bg-success/10 border border-success/30 rounded-lg p-3">
                  {info}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-brand text-brand-foreground rounded-lg font-bold hover:brand-glow disabled:opacity-50"
              >
                {loading ? "جاري الحفظ..." : "حفظ كلمة السر الجديدة"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        required
        type={show ? "text" : "password"}
        minLength={6}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 pe-12 bg-background border border-border rounded-lg"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground"
      >
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
