import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import {
  Boxes,
  FolderTree,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Package,
  ScrollText,
  Settings,
  ShoppingBag,
  Star,
  TicketPercent,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useApp } from "@/contexts/AppContext";
import { useAdminRole, type AdminRole } from "@/hooks/useAdminRole";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    // Reuse the user already fetched by the _authenticated layout gate.
    const user = (context as { user?: { id: string } } | undefined)?.user;
    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw redirect({ to: "/auth" });
    }
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user!.id;
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const userRoles = (rolesData ?? []).map((r) => r.role as AdminRole);
    // Admins and moderators can both open the admin dashboard
    const canAccess = userRoles.some((r) => r === "admin" || r === "moderator");
    if (!canAccess) throw redirect({ to: "/dashboard" });

    if (typeof window !== "undefined" && userRoles.length > 0) {
      try {
        sessionStorage.setItem("sahlnalk_admin_roles", JSON.stringify(userRoles));
      } catch (_) {}
    }

    return { user, userRoles };
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h2 className="text-xl font-bold text-destructive">حدث خطأ في لوحة التحكم</h2>
        <p className="text-sm text-muted-foreground break-words">
          {(error as Error)?.message ?? "Unknown error"}
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg bg-brand text-brand-foreground hover:opacity-90 transition"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  ),
  component: AdminLayout,
});

function AdminLayout() {
  const routeContext = Route.useRouteContext();
  const { t } = useApp();
  const { isAdmin, canModerate, isLoading } = useAdminRole(routeContext?.userRoles);
  useAdminRealtime(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const pending = useQuery({
    queryKey: ["admin-pending-count"],
    queryFn: async () => {
      // 1. Non-PayPal orders with status pending or paid (require admin attention)
      const { count: nonPaypalCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "paid"])
        .neq("payment_gateway", "paypal");

      // 2. PayPal orders that have been successfully paid
      const { count: paypalPaidCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("payment_gateway", "paypal")
        .in("status", ["paid", "processing"]);

      return (nonPaypalCount ?? 0) + (paypalPaidCount ?? 0);
    },
    refetchInterval: 30_000,
    enabled: canModerate,
  });

  const allLinks: {
    to: string;
    label: string;
    exact?: boolean;
    badge?: number;
    adminOnly?: boolean;
    Icon: ComponentType<{ className?: string }>;
  }[] = [
    { to: "/admin", label: t.admin.overview, exact: true, adminOnly: true, Icon: LayoutDashboard },
    { to: "/admin/products", label: t.admin.products, Icon: Package },
    { to: "/admin/categories", label: t.admin.categories, Icon: FolderTree },
    { to: "/admin/orders", label: t.admin.orders, badge: pending.data ?? 0, Icon: ShoppingBag },
    { to: "/admin/inventory", label: "مخزون التسليم", Icon: Boxes },
    { to: "/admin/users", label: t.admin.users, adminOnly: true, Icon: Users },
    { to: "/admin/testimonials", label: t.admin.testimonials, Icon: Star },
    { to: "/admin/reviews", label: "تقييمات الخدمات", Icon: MessagesSquare },
    { to: "/admin/faqs", label: "الأسئلة الشائعة", adminOnly: true, Icon: HelpCircle },
    { to: "/admin/refunds", label: "التعويضات", Icon: Undo2 },
    { to: "/admin/staff", label: "الاستوك", adminOnly: true, Icon: KeyRound },
    { to: "/admin/coupons", label: "أكواد الخصم", Icon: TicketPercent },
    { to: "/admin/audit", label: "سجل الأعمال", adminOnly: true, Icon: ScrollText },
    // { to: "/admin/settings/integrations", label: "التكاملات", adminOnly: true },
    { to: "/admin/settings", label: t.admin.settings, adminOnly: true, Icon: Settings },
  ];

  // Admin has full access to all admin pages.
  // While the role is still resolving we render skeleton rows instead of the
  // moderator-filtered list, so an admin never sees the menu "downgrade" and
  // flash back to full a second later.
  const links = allLinks.filter((l) => isAdmin || !l.adminOnly);

  const linksSkeleton = (
    <div className="flex flex-col gap-1" aria-hidden>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="size-8 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div
            className="h-3.5 animate-pulse rounded-full bg-muted"
            style={{ width: `${58 - (i % 3) * 12}%` }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      {/* Mobile nav trigger */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 md:hidden mb-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border/60 rounded-2xl text-sm font-bold shadow-sm">
              <span className="flex items-center gap-2">
                <Menu className="size-4 text-brand" />
                القائمة
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                {links.find((l) => (l.exact ? currentPath === l.to : currentPath.startsWith(l.to)))
                  ?.label ?? ""}
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-lg">لوحة التحكم</h3>
              <button
                onClick={() => setMobileOpen(false)}
                className="grid size-8 place-items-center rounded-full border border-border/60 text-muted-foreground hover:border-brand/60 hover:text-brand"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {isLoading ? (
                linksSkeleton
              ) : (
                links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to as string}
                    activeOptions={{ exact: !!l.exact }}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 rounded-2xl text-sm font-bold hover:bg-muted transition flex items-center gap-2.5"
                    activeProps={{ className: "bg-brand/[0.07] text-brand" }}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                      <l.Icon className="size-4" />
                    </span>
                    <span className="flex-1">{l.label}</span>
                    {l.badge && l.badge > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-warning/15 text-warning text-[11px] font-extrabold border border-warning/30">
                        {l.badge}
                      </span>
                    ) : null}
                  </Link>
                ))
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-6 grid md:grid-cols-[230px_1fr] gap-4 md:gap-6">
        <aside className="hidden md:block h-fit md:sticky md:top-24 bg-card border border-border/60 rounded-3xl p-2.5 shadow-sm">
          {isLoading ? (
            linksSkeleton
          ) : (
            <nav className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to as string}
                  preload="intent"
                  activeOptions={{ exact: !!l.exact }}
                  className="px-2.5 py-2 rounded-2xl text-sm font-bold hover:bg-muted whitespace-nowrap transition flex items-center gap-2.5"
                  activeProps={{ className: "bg-brand/[0.07] text-brand" }}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                    <l.Icon className="size-4" />
                  </span>
                  <span className="flex-1">{l.label}</span>
                  {l.badge && l.badge > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-warning/15 text-warning text-[11px] font-extrabold border border-warning/30 animate-pulse">
                      {l.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          )}
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
