import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/error-handler";
import type { User } from "@supabase/supabase-js";
import { ARAB_COUNTRIES, dialForCountry } from "@/lib/arab-countries";
import { filterName, filterDigits } from "@/lib/input-filters";

const searchSchema = z.object({ complete: z.string().optional() });

export const Route = createFileRoute("/_authenticated/account")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "معلومات الحساب، سهلنالك" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { t, lang } = useApp();
  const queryClient = useQueryClient();
  const { complete } = useSearch({ from: "/_authenticated/account" });
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwInfo, setPwInfo] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mustComplete = complete === "1";

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user ?? null;
      setUser(u);
      if (!u) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, phone, country")
        .eq("id", u.id)
        .maybeSingle();
      const md = (u.user_metadata ?? {}) as any;
      setDisplayName(p?.display_name ?? md.full_name ?? md.name ?? "");
      setPhone(p?.phone ?? md.phone ?? "");
      setCountry(p?.country ?? md.country ?? "");
    })();
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          phone: phone.trim(),
          country: country.trim(),
        })
        .eq("id", user.id);
      if (err) throw err;
      await supabase.auth.updateUser({
        data: { display_name: displayName.trim(), phone: phone.trim(), country: country.trim() },
      });
      // Instant: refresh every surface showing this profile right away
      // (realtime also pushes the change within ~200ms as a safety net).
      queryClient.invalidateQueries();
      setInfo(lang === "ar" ? "تم حفظ التعديلات" : "Changes saved");
      if (mustComplete) {
        setTimeout(() => navigate({ to: "/dashboard" }), 600);
      }
    } catch (err: any) {
      setError(friendlyErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwInfo(null);
    if (newPassword.length < 6) {
      setPwError(lang === "ar" ? "كلمة السر لازم 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(lang === "ar" ? "الكلمتان غير متطابقتين" : "Passwords do not match");
      return;
    }
    setPwLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setPwInfo(lang === "ar" ? "تم تحديث كلمة السر" : "Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(friendlyErrorMessage(err, lang));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PageHeader
        title={lang === "ar" ? "معلومات الحساب" : "Account Info"}
        subtitle={`${lang === "ar" ? "أهلاً" : "Welcome"}${displayName ? ` · ${displayName}` : ""}`}
      />
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-2xl space-y-4">
          {mustComplete && (
            <div className="p-4 rounded-2xl border border-warning/40 bg-warning/10 text-sm">
              {lang === "ar"
                ? "من فضلك أكمل رقم الواتساب والدولة لإتمام إنشاء الحساب."
                : "Please complete your WhatsApp number and country to finish creating your account."}
            </div>
          )}

          <form onSubmit={saveProfile} className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-lg font-extrabold">
              {lang === "ar" ? "البيانات الشخصية" : "Personal details"}
            </h2>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">
                {lang === "ar" ? "الاسم" : "Name"}
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(filterName(e.target.value))}
                className="w-full px-4 py-3 bg-background border border-border rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </label>
              <input
                disabled
                value={user?.email ?? ""}
                className="w-full px-4 py-3 bg-muted border border-border rounded-lg opacity-70"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">
                {lang === "ar" ? "الدولة" : "Country"}
              </label>
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
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">
                {lang === "ar" ? "رقم الواتساب" : "WhatsApp number"}
              </label>
              <div className="flex items-stretch rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-brand/40">
                <span className="px-3 grid place-items-center bg-muted text-sm font-mono font-bold text-muted-foreground select-none" dir="ltr">+{dialForCountry(country)}</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(filterDigits(e.target.value, 15))}
                  className="flex-1 px-4 py-3 bg-transparent outline-none"
                  dir="ltr"
                />
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {info && (
              <p className="text-success text-sm bg-success/10 border border-success/30 rounded-lg p-3">
                {info}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:brightness-105 active:scale-[0.99] disabled:opacity-50 transition"
            >
              {loading ? t.common.loading : lang === "ar" ? "حفظ التعديلات" : "Save changes"}
            </button>
          </form>

          <form onSubmit={changePassword} className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-lg font-extrabold">
              {lang === "ar" ? "تغيير كلمة السر" : "Change password"}
            </h2>
            <input
              type="password"
              placeholder={lang === "ar" ? "كلمة السر الجديدة" : "New password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg"
              minLength={6}
            />
            <input
              type="password"
              placeholder={lang === "ar" ? "تأكيد كلمة السر" : "Confirm password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg"
              minLength={6}
            />
            {pwError && <p className="text-destructive text-sm">{pwError}</p>}
            {pwInfo && (
              <p className="text-success text-sm bg-success/10 border border-success/30 rounded-lg p-3">
                {pwInfo}
              </p>
            )}
            <button
              type="submit"
              disabled={pwLoading || !newPassword}
              className="w-full px-4 py-3 border border-border rounded-lg font-bold hover:bg-muted disabled:opacity-50"
            >
              {pwLoading ? t.common.loading : lang === "ar" ? "تحديث كلمة السر" : "Update password"}
            </button>
          </form>

          <div className="text-center">
            <Link to="/dashboard" className="text-sm font-bold text-brand hover:underline">
              ← {lang === "ar" ? "الرجوع للوحة التحكم" : "Back to dashboard"}
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
