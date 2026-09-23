import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ShoppingCart, Menu, X, Search } from "lucide-react";
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
      className={`fixed top-0 start-0 end-0 z-[10000] border-b border-border/80 bg-background/95 backdrop-blur-xl transition-all duration-300 ${shrunk ? "shadow-[0_8px_30px_-12px_rgba(11,169,224,0.3)]" : ""}`}
    >
      {/* Top signature gradient accent line */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0]" />

      <div
        className={`app-header-row max-w-[94rem] mx-auto px-3 sm:px-6 flex items-center transition-all duration-300 ${shrunk ? "h-12 sm:h-14" : "h-14 sm:h-20"}`}
      >
        {/* ── MOBILE HEADER LAYOUT (md:hidden) ── */}
        <div className="flex md:hidden items-center justify-between w-full gap-2">
          {/* Right Side (يمين): Menu button + Bell */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="app-header-menu btn-shine grid size-9.5 place-items-center rounded-full bg-gradient-to-l from-[#0b5fc0] via-[#00a9e0] to-[#33d9f7] text-white shadow-md transition-all duration-300 hover:scale-105 active:scale-95"
                  aria-label="Menu"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side={lang === "ar" ? "right" : "left"} className="w-[295px] p-0 border-s border-border">
                <div className="flex items-center justify-between p-4 border-b border-border/80 bg-muted/30">
                  <div className="flex items-center">
                    <img
                      src="/logo.png"
                      alt="سهلنالك Sahlnalk"
                      decoding="async"
                      className="h-8.5 w-auto rounded-lg object-contain"
                    />
                  </div>
                  <span className="w-6" />
                </div>
                <div className="px-4 pt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeMobile();
                      setTimeout(() => setSearchOpen(true), 120);
                    }}
                    className="w-full flex items-center gap-2 bg-muted/60 border border-border/80 rounded-full px-3.5 py-2 hover:border-brand transition-colors text-start"
                  >
                    <Search className="size-4 text-brand shrink-0" />
                    <span className="text-sm font-semibold text-muted-foreground flex-1">
                      {lang === "ar" ? "ابحث عن خدمة..." : "Search services..."}
                    </span>
                  </button>
                </div>
                <nav className="flex flex-col px-3 py-3">
                  <div className="px-2 pt-2 pb-1">
                    <h3 className="text-brand text-xs font-black uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1.5 h-3.5 bg-gradient-to-b from-[#0bb6e4] to-[#0b3fa0] rounded-full" />
                      {lang === "ar" ? "الصفحات" : "Pages"}
                    </h3>
                  </div>
                  <div className="flex flex-col space-y-1 mt-1">
                    <Link
                      to="/"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 hover:bg-brand/10 hover:text-brand"
                      activeProps={{ className: "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-md" }}
                      activeOptions={{ exact: true }}
                    >
                      {t.nav.home}
                    </Link>
                    <Link
                      to="/shop"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 hover:bg-brand/10 hover:text-brand"
                      activeProps={{ className: "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-md" }}
                    >
                      {t.nav.shop ?? (lang === "ar" ? "المتجر" : "Shop")}
                    </Link>
                    <Link
                      to="/about"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 hover:bg-brand/10 hover:text-brand"
                      activeProps={{ className: "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-md" }}
                    >
                      {t.nav.about}
                    </Link>
                    <Link
                      to="/terms"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 hover:bg-brand/10 hover:text-brand"
                      activeProps={{ className: "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-md" }}
                    >
                      {t.nav.terms}
                    </Link>
                    <Link
                      to="/privacy"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 hover:bg-brand/10 hover:text-brand"
                      activeProps={{ className: "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-md" }}
                    >
                      {t.nav.privacy}
                    </Link>
                  </div>

                  <div className="my-3 border-t border-border/60" />

                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={closeMobile}
                      className="px-3.5 py-2.5 text-sm font-black rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all flex items-center justify-between"
                    >
                      <span>{lang === "ar" ? "لوحة التحكم" : "Admin"}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground font-black">
                        PRO
                      </span>
                    </Link>
                  )}
                </nav>

                <div className="absolute bottom-0 start-0 end-0 p-4 border-t border-border/80 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between bg-muted/80 border border-border/60 rounded-full p-1 shadow-inner">
                    <button
                      onClick={() => setLang("en")}
                      className={`flex-1 py-1.5 text-xs font-black rounded-full transition-all duration-200 ${lang === "en"
                        ? "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setLang("ar")}
                      className={`flex-1 py-1.5 text-xs font-black rounded-full transition-all duration-200 ${lang === "ar"
                        ? "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      العربية
                    </button>
                  </div>

                  {user ? (
                    <SiteButton variant="gradient" size="pill" asChild className="w-full font-black shadow-md">
                      <Link to="/dashboard" onClick={closeMobile}>
                        {t.nav.dashboard}
                      </Link>
                    </SiteButton>
                  ) : (
                    <SiteButton variant="gradient" size="pill" asChild className="w-full font-black shadow-md">
                      <Link to="/auth" onClick={closeMobile}>
                        {t.nav.login}
                      </Link>
                    </SiteButton>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <span className="app-header-bell">
              <AdminNotifications />
            </span>
          </div>

          {/* Center (في النص): Logo */}
          <div className="flex-1 flex justify-center items-center min-w-0">
            <Link
              to="/"
              className="flex items-center transition-transform duration-300 hover:scale-[1.03] active:scale-95"
              aria-label={lang === "ar" ? "سهلنالك" : "Sahlnalk"}
            >
              <img
                src="/gridLogo.png"
                alt="سهلنالك Sahlnalk"
                decoding="async"
                className={`w-auto rounded-lg object-contain transition-all duration-300 ${shrunk ? "h-7" : "h-8.5"}`}
              />
            </Link>
          </div>

          {/* Left side (شمال): Search + Cart */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={lang === "ar" ? "بحث" : "Search"}
              className="app-header-search size-9.5 grid place-items-center rounded-full border border-border/80 bg-muted/60 text-foreground transition-all duration-300 hover:border-brand/60 hover:text-brand hover:scale-110 active:scale-90"
            >
              <Search className="size-4.5" />
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Cart"
              data-cart-anchor
              className={`app-header-cart relative size-9.5 grid place-items-center rounded-full border border-border/80 bg-muted/60 text-foreground transition-all duration-300 hover:border-brand/60 hover:text-brand hover:scale-110 active:scale-90 ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
            >
              <ShoppingCart className={`size-4.5 ${bumping ? "text-brand" : ""}`} />
              {cartCount > 0 && (
                <span
                  className={`absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-gradient-to-r from-[#0bb6e4] to-[#0b3fa0] text-[10px] font-black text-white shadow-md ring-2 ring-background ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── DESKTOP HEADER LAYOUT (hidden md:flex) ── */}
        <div className="hidden md:flex items-center justify-between w-full gap-4">
          <div className="app-header-logo flex min-w-0 shrink-0 items-center">
            <Link
              to="/"
              className="flex items-center min-w-0 transition-transform duration-300 hover:scale-[1.03] active:scale-95"
              aria-label={lang === "ar" ? "سهلنالك" : "Sahlnalk"}
            >
              <img
                src="/gridLogo.png"
                alt="سهلنالك Sahlnalk"
                decoding="async"
                className={`w-auto rounded-lg object-contain shrink-0 transition-all duration-300 ${shrunk ? "h-8" : "h-10"}`}
              />
            </Link>
          </div>

          {/* Center search pill (desktop) */}
          <div className="flex flex-1 justify-center px-4 min-w-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-full max-w-md flex items-center gap-2.5 rounded-full border border-border/80 bg-muted/50 px-4 py-2 text-sm text-muted-foreground transition-all duration-300 hover:border-brand/60 hover:bg-muted/80 hover:text-brand hover:shadow-md hover:scale-[1.01] active:scale-[0.99]"
            >
              <Search className="size-4 shrink-0 text-brand" />
              <span className="flex-1 truncate text-start font-semibold">
                {lang === "ar" ? "دوّر على اشتراك..." : "Search subscriptions..."}
              </span>
            </button>
          </div>

          <div className="app-header-actions flex items-center gap-3 shrink-0">
            <div className="flex bg-muted/80 border border-border/60 rounded-full p-1 shadow-inner">
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1 text-xs font-black rounded-full transition-all duration-200 hover:scale-105 active:scale-95 ${lang === "en"
                  ? "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("ar")}
                className={`px-3 py-1 text-xs font-black rounded-full transition-all duration-200 hover:scale-105 active:scale-95 ${lang === "ar"
                  ? "bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                AR
              </button>
            </div>

            <span className="app-header-bell">
              <AdminNotifications />
            </span>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Cart"
              data-cart-anchor
              className={`app-header-cart relative size-9.5 grid place-items-center rounded-full border border-border/80 bg-muted/60 text-foreground transition-all duration-300 hover:border-brand/60 hover:text-brand hover:scale-110 active:scale-90 ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
            >
              <ShoppingCart className={`size-4.5 ${bumping ? "text-brand" : ""}`} />
              {cartCount > 0 && (
                <span
                  className={`absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-gradient-to-r from-[#0bb6e4] to-[#0b3fa0] text-[10px] font-black text-white shadow-md ring-2 ring-background ${bumping ? "animate-[cartBump_0.5s_ease-out]" : ""}`}
                >
                  {cartCount}
                </span>
              )}
            </button>

            {user ? (
              <SiteButton variant="gradient" size="sm" asChild className="inline-flex btn-shine font-black transition-transform duration-300 hover:scale-105 active:scale-95 shadow-md">
                <Link to="/dashboard">{t.nav.dashboard}</Link>
              </SiteButton>
            ) : (
              <SiteButton variant="gradient" size="sm" asChild className="inline-flex btn-shine font-black transition-transform duration-300 hover:scale-105 active:scale-95 shadow-md">
                <Link to="/auth">{t.nav.login}</Link>
              </SiteButton>
            )}
          </div>
        </div>
      </div>

      {/* Tier 2: nav links (desktop) */}
      <div className="hidden md:block border-t border-border/40 bg-muted/20">
        <div className="max-w-[94rem] mx-auto px-3 sm:px-6 flex items-center justify-center gap-3 sm:gap-4 h-10.5 text-sm">
          <Link
            to="/"
            className="px-4 py-1 rounded-full font-extrabold text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-brand hover:bg-brand/10"
            activeProps={{
              className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] via-[#00a9e0] to-[#0bb6e4] shadow-md shadow-brand/20 ring-1 ring-white/30 hover:scale-105",
            }}
            activeOptions={{ exact: true }}
          >
            {t.nav.home}
          </Link>
          <Link
            to="/shop"
            className="px-4 py-1 rounded-full font-extrabold text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-brand hover:bg-brand/10"
            activeProps={{
              className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] via-[#00a9e0] to-[#0bb6e4] shadow-md shadow-brand/20 ring-1 ring-white/30 hover:scale-105",
            }}
          >
            {t.nav.shop ?? (lang === "ar" ? "المتجر" : "Shop")}
          </Link>
          <Link
            to="/about"
            className="px-4 py-1 rounded-full font-extrabold text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-brand hover:bg-brand/10"
            activeProps={{
              className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] via-[#00a9e0] to-[#0bb6e4] shadow-md shadow-brand/20 ring-1 ring-white/30 hover:scale-105",
            }}
          >
            {t.nav.about}
          </Link>
          <Link
            to="/terms"
            className="px-4 py-1 rounded-full font-extrabold text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-brand hover:bg-brand/10"
            activeProps={{
              className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] via-[#00a9e0] to-[#0bb6e4] shadow-md shadow-brand/20 ring-1 ring-white/30 hover:scale-105",
            }}
          >
            {t.nav.terms}
          </Link>
          <Link
            to="/privacy"
            className="px-4 py-1 rounded-full font-extrabold text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-brand hover:bg-brand/10"
            activeProps={{
              className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] via-[#00a9e0] to-[#0bb6e4] shadow-md shadow-brand/20 ring-1 ring-white/30 hover:scale-105",
            }}
          >
            {t.nav.privacy}
          </Link>
          {hasStock && (
            <Link
              to="/stock"
              className="px-4 py-1 rounded-full font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:text-white"
              activeProps={{
                className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md ring-1 ring-white/30 hover:scale-105",
              }}
            >
              {lang === "ar" ? "الاستوك" : "Stock"}
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="px-4 py-1 rounded-full font-black text-brand bg-brand/10 transition-all duration-200 hover:scale-105 hover:bg-brand hover:text-white"
              activeProps={{
                className: "px-4 py-1 rounded-full font-black text-white bg-gradient-to-r from-[#0b5fc0] to-[#00a9e0] shadow-md ring-1 ring-white/30 hover:scale-105",
              }}
            >
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
