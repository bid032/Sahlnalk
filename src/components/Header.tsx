import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ShoppingCart, Menu, X, Search, Sun, Moon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CartDrawer } from "@/components/CartDrawer";
import { SiteButton } from "@/components/ui/site-button";
import { AdminNotifications } from "@/components/AdminNotifications";
import { SearchOverlay } from "@/components/SearchOverlay";

export function Header() {
  const { lang, setLang, t, cartCount, cartBumpKey, theme, themeMode, toggleTheme } = useApp();
  const [bumping, setBumping] = useState(false);
  useEffect(() => {
    if (!cartBumpKey) return;
    setBumping(true);
    const id = setTimeout(() => setBumping(false), 520);
    return () => clearTimeout(id);
  }, [cartBumpKey]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasStock, setHasStock] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const onScroll = () => setShrunk(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      const h = shrunk ? (w >= 768 ? 96 : w >= 640 ? 56 : 48) : w >= 768 ? 120 : w >= 640 ? 80 : 56;
      document.documentElement.style.setProperty("--app-header-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [shrunk]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setHasStock(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .then(({ data }) => setIsAdmin(!!(data && data.length > 0)));
    supabase.rpc("current_user_stock_access").then(({ data }) => setHasStock(!!data));
  }, [user]);

  const closeMobile = () => setMobileOpen(false);

  const nav = (
    <nav
      className={`fixed top-0 start-0 end-0 z-[10000] border-b border-border bg-background/90 backdrop-blur-md transition-all duration-300 ${shrunk ? "shadow-[0_6px_24px_-12px_hsl(var(--brand)/0.35)]" : ""}`}
    >
      <div
        className={`app-header-row max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-2 sm:gap-4 transition-all duration-300 ${shrunk ? "h-12 sm:h-14" : "h-14 sm:h-20"}`}
      >
        <div className="app-header-logo flex min-w-0 shrink-0 items-center">
          <Link
            to="/"
            className="flex items-center min-w-0"
            aria-label={lang === "ar" ? "سهلنالك" : "Sahlnalk"}
          >
            <img
              src="/logo.png"
              alt="سهلنالك Sahlnalk"
              decoding="async"
              className={`w-auto rounded-lg object-contain shrink-0 transition-all duration-300 ${shrunk ? "h-7 sm:h-8" : "h-8 sm:h-10"}`}
            />
          </Link>
        </div>

        {/* Center search pill (desktop) */}
        <div className="hidden md:flex flex-1 justify-center px-4 min-w-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full max-w-md flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-4 py-2 text-sm text-muted-foreground transition hover:border-brand/50 hover:text-brand active:scale-[0.99]"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate text-start">
              {lang === "ar" ? "دوّر على اشتراك..." : "Search subscriptions..."}
            </span>
          </button>
        </div>

        <div className="app-header-actions flex items-center gap-1 sm:gap-3 shrink-0">
          <div className="hidden sm:flex bg-muted rounded-full p-1">
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-all ${
                lang === "en" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("ar")}
              className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-all ${
                lang === "ar" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
              }`}
            >
              AR
            </button>
          </div>

          {/* Sahlnalk theme toggle: visible for switching between Light and New Gradient mode */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={lang === "ar" ? (theme === "dark" ? "الوضع الفاتح" : "وضع الجريديانت") : theme === "dark" ? "Light mode" : "Gradient mode"}
            className="size-9 grid place-items-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-all hover:border-brand/60 hover:text-brand active:scale-95"
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <span className="app-header-bell">
          <AdminNotifications />
          </span>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={lang === "ar" ? "بحث" : "Search"}
            className="app-header-search size-9 grid place-items-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-colors hover:border-brand/60 hover:text-brand active:scale-95 md:bg-transparent"
          >
            <Search className="size-[18px]" />
          </button>
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label="Cart"
            data-cart-anchor
            className={`app-header-cart relative size-9 grid place-items-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-all hover:border-brand/60 hover:text-brand active:scale-95 md:bg-transparent ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
          >
            <ShoppingCart className={`size-[18px] ${bumping ? "text-brand" : ""}`} />
            {cartCount > 0 && (
              <span
                className={`absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-black text-brand-foreground ring-2 ring-white ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
              >
                {cartCount}
              </span>
            )}
          </button>
          <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />

          {user ? (
            <SiteButton variant="gradient" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/dashboard">{t.nav.dashboard}</Link>
            </SiteButton>
          ) : (
            <SiteButton variant="gradient" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/auth">{t.nav.login}</Link>
            </SiteButton>
          )}

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="app-header-menu btn-shine grid size-9 place-items-center rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 shadow-[0_8px_20px_-8px_rgba(11,95,192,0.7)] transition-all hover:brightness-110 active:scale-95 md:hidden"
                aria-label="Menu"
              >
                <Menu className="size-[18px]" />
              </button>
            </SheetTrigger>
            <SheetContent side={lang === "ar" ? "right" : "left"} className="w-[280px] p-0">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center">
                  <img
                    src="/logo.png"
                    alt="سهلنالك Sahlnalk"
                    decoding="async"
                    className="h-8 w-auto rounded-lg object-contain"
                  />
                </div>
                <span className="w-6" />
              </div>
              <div className="px-4 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    setTimeout(() => setSearchOpen(true), 120);
                  }}
                  className="w-full flex items-center gap-2 bg-muted/60 border border-border rounded-full px-3 py-2 hover:border-brand transition-colors text-start"
                >
                  <Search className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground flex-1">
                    {lang === "ar" ? "ابحث عن خدمة..." : "Search services..."}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="mt-2 w-full flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 text-start transition active:scale-[0.99]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">
                      {lang === "ar" ? "مظهر الموقع" : "Appearance"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {lang === "ar"
                        ? theme === "dark"
                          ? "وضع الجريديانت — اضغط للفاتح"
                          : "الوضع الفاتح — اضغط للجريديانت"
                        : theme === "dark"
                          ? "Gradient Mode — tap for light"
                          : "Light Mode — tap for gradient"}
                    </span>
                  </span>
                  <span
                    className="grid h-6 w-11 shrink-0 place-items-center rounded-full bg-muted transition-colors"
                    aria-hidden
                  >
                    <span
                      className={`size-5 rounded-full bg-white shadow transition-transform ${
                        theme === "dark" ? "-translate-x-2.5 rtl:translate-x-2.5" : "translate-x-2.5 rtl:-translate-x-2.5"
                      }`}
                    />
                </span>
              </button>
              </div>
              <nav className="flex flex-col px-2 py-3">
                {/* الصفحات */}
                <div className="px-3 pt-2 pb-1">
                  <h3 className="text-brand text-sm font-extrabold flex items-center gap-2">
                    <span className="w-1 h-4 bg-brand rounded-full" />
                    {lang === "ar" ? "الصفحات" : "Pages"}
                  </h3>
                </div>
                <div className="flex flex-col border-t border-border/50">
                  <Link
                    to="/"
                    onClick={closeMobile}
                    className="px-4 py-3 text-sm font-semibold text-foreground/90 hover:bg-muted hover:text-brand border-b border-border/40 transition-colors"
                    activeProps={{ className: "text-brand" }}
                    activeOptions={{ exact: true }}
                  >
                    {t.nav.home}
                  </Link>
                  <Link
                    to="/about"
                    onClick={closeMobile}
                    className="px-4 py-3 text-sm font-semibold text-foreground/90 hover:bg-muted hover:text-brand border-b border-border/40 transition-colors"
                    activeProps={{ className: "text-brand" }}
                  >
                    {t.nav.about}
                  </Link>
                  <Link
                    to="/privacy"
                    onClick={closeMobile}
                    className="px-4 py-3 text-sm font-semibold text-foreground/90 hover:bg-muted hover:text-brand border-b border-border/40 transition-colors"
                    activeProps={{ className: "text-brand" }}
                  >
                    {t.nav.privacy}
                  </Link>
                  <Link
                    to="/terms"
                    onClick={closeMobile}
                    className="px-4 py-3 text-sm font-semibold text-foreground/90 hover:bg-muted hover:text-brand border-b border-border/40 transition-colors"
                    activeProps={{ className: "text-brand" }}
                  >
                    {t.nav.terms}
                  </Link>
                  {user && (
                    <Link
                      to="/dashboard"
                      onClick={closeMobile}
                      className="px-4 py-3 text-sm font-semibold text-foreground/90 hover:bg-muted hover:text-brand border-b border-border/40 transition-colors"
                      activeProps={{ className: "text-brand" }}
                    >
                      {t.nav.dashboard}
                    </Link>
                  )}
                  {hasStock && (
                    <Link
                      to="/stock"
                      onClick={closeMobile}
                      className="px-4 py-3 text-sm font-extrabold border-b border-border/40 transition-colors text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    >
                      {lang === "ar" ? "الاستوك" : "Stock"}
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={closeMobile}
                      className="px-4 py-3 text-sm font-extrabold text-brand hover:bg-muted border-b border-border/40 transition-colors"
                    >
                      {t.nav.admin}
                    </Link>
                  )}
                </div>
              </nav>

              <div className="p-3 border-t border-border space-y-2">
                <div className="flex bg-muted rounded-full p-1">
                  <button
                    onClick={() => setLang("en")}
                    className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                      lang === "en" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setLang("ar")}
                    className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                      lang === "ar" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                    }`}
                  >
                    العربية
                  </button>
                </div>
                {user ? (
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      closeMobile();
                    }}
                    className="w-full px-4 py-2.5 bg-muted rounded-lg text-sm font-bold hover:bg-destructive/10 hover:text-destructive transition"
                  >
                    {t.nav.logout}
                  </button>
                ) : (
                  <Link
                    to="/auth"
                    onClick={closeMobile}
                    className="btn-shine block text-center px-4 py-2.5 bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white [text-shadow:0_1px_2px_rgba(11,63,160,0.55)] ring-1 ring-inset ring-white/30 rounded-full text-sm font-bold shadow-sm active:scale-95 transition"
                  >
                    {t.nav.login}
                  </Link>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Tier 2: nav links (desktop) */}
      <div className="hidden md:block border-t border-brand/10">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-7 h-10 text-[13px] font-bold text-muted-foreground">
          <Link
            to="/"
            className="transition hover:text-brand-deep"
            activeProps={{ className: "text-brand-deep" }}
            activeOptions={{ exact: true }}
          >
            {t.nav.home}
          </Link>
          <Link
            to="/shop"
            className="transition hover:text-brand-deep"
            activeProps={{ className: "text-brand-deep" }}
          >
            {t.nav.shop ?? (lang === "ar" ? "المتجر" : "Shop")}
          </Link>
          <Link
            to="/about"
            className="transition hover:text-brand-deep"
            activeProps={{ className: "text-brand-deep" }}
          >
            {t.nav.about}
          </Link>
          <Link
            to="/terms"
            className="transition hover:text-brand-deep"
            activeProps={{ className: "text-brand-deep" }}
          >
            {t.nav.terms}
          </Link>
          <Link
            to="/privacy"
            className="transition hover:text-brand-deep"
            activeProps={{ className: "text-brand-deep" }}
          >
            {t.nav.privacy}
          </Link>
          {hasStock && (
            <Link
              to="/stock"
              className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-extrabold text-brand transition hover:bg-brand hover:text-white"
            >
              {lang === "ar" ? "الاستوك" : "Stock"}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="text-brand font-extrabold hover:underline">
              {t.nav.admin}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <div
        aria-hidden
        className={`transition-all duration-300 ${shrunk ? "h-12 sm:h-14 md:h-24" : "h-14 sm:h-20 md:h-[120px]"}`}
      />
      {nav}
    </>
  );
}
