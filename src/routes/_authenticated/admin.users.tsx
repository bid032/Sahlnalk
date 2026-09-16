import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { showError } from "@/lib/error-handler";
import {
  Search,
  Download,
  Users,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  X,
  Boxes,
  Trash2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deleteUserAccount } from "@/lib/admin-users.functions";
import { SiteButton } from "@/components/ui/site-button";
import { AdminHero, HeroAction } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    // Only admin can access the users management page
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/admin/products" });
  },
  component: AdminUsers,
});

type RoleFilter = "all" | "admin" | "moderator" | "user" | "stock";

function AdminUsers() {
  const { t, lang, notify, confirm } = useApp();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [stockUser, setStockUser] = useState<any | null>(null);
  const deleteUserFn = useServerFn(deleteUserAccount);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: list, error }, profilesRes, rolesRes] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase
          .from("profiles")
          .select("id, display_name, phone, country, preferred_language, created_at, stock_access"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
      return (list ?? []).map((u: any) => {
        const p: any = profileMap.get(u.id) ?? {};
        return {
          id: u.id,
          display_name: u.display_name ?? p.display_name ?? "",
          email: u.email ?? "",
          phone: p.phone ?? "",
          country: p.country ?? "",
          preferred_language: p.preferred_language ?? "",
          created_at: u.created_at ?? p.created_at ?? null,
          stock_access: !!p.stock_access,
          has_stock_password: !!u.has_stock_password,
          user_roles: (rolesRes.data ?? [])
            .filter((r: any) => r.user_id === u.id)
            .map((r: any) => ({ role: r.role })),
        };
      });
    },
  });

  const toggleRole = useMutation({
    mutationFn: async ({
      userId,
      role,
      add,
    }: {
      userId: string;
      role: "admin" | "moderator";
      add: boolean;
    }) => {
      if (add) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      notify(isAr ? "تم تحديث الصلاحيات" : "Roles updated", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await deleteUserFn({ data: { userId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      notify(isAr ? "تم حذف المستخدم" : "User deleted", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const askDelete = async (u: any) => {
    const ok = await confirm({
      message: isAr
        ? `سيتم حذف حساب ${u.display_name || u.email} نهائياً مع كل بياناته. متأكد؟`
        : `Permanently delete ${u.display_name || u.email} and all their data. Continue?`,
      tone: "danger",
    });
    if (!ok) return;
    deleteUser.mutate(u.id);
  };

  const stats = useMemo(() => {
    const data = users.data ?? [];
    const admins = data.filter((u: any) =>
      u.user_roles?.some((r: any) => r.role === "admin"),
    ).length;
    const mods = data.filter((u: any) =>
      u.user_roles?.some((r: any) => r.role === "moderator"),
    ).length;
    const customers = data.filter((u: any) => {
      const roles = (u.user_roles ?? []).map((r: any) => r.role);
      return roles.includes("user") && !roles.includes("admin") && !roles.includes("moderator");
    }).length;
    const stock = data.filter((u: any) => u.stock_access).length;
    return { total: data.length, admins, mods, customers, stock };
  }, [users.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let data = users.data ?? [];
    if (roleFilter !== "all") {
      data = data.filter((u: any) => {
        if (roleFilter === "stock") return !!u.stock_access;
        const roles = (u.user_roles ?? []).map((r: any) => r.role);
        if (roleFilter === "user")
          return roles.includes("user") && !roles.includes("admin") && !roles.includes("moderator");
        return roles.includes(roleFilter);
      });
    }
    if (!q) return data;
    return data.filter((u: any) => {
      const roles = (u.user_roles ?? []).map((r: any) => r.role).join(" ");
      return [u.display_name, u.email, u.phone, u.country, u.preferred_language, roles, u.id]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q));
    });
  }, [users.data, search, roleFilter]);

  const exportXlsx = () => {
    const rows = (filtered ?? []).map((u: any) => ({
      ID: u.id,
      Name: u.display_name,
      Email: u.email,
      Phone: u.phone,
      Country: u.country,
      Language: u.preferred_language,
      Roles: (u.user_roles ?? []).map((r: any) => r.role).join(", "),
      "Created At": u.created_at ? new Date(u.created_at).toISOString() : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, `users-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const placeholder = isAr
    ? "دوّر على مستخدم بالاسم أو الإيميل..."
    : "Search name, email, phone...";

  const roleTabs: { key: RoleFilter; label: string; count: number }[] = [
    { key: "all", label: isAr ? "الكل" : "All", count: stats.total },
    { key: "admin", label: isAr ? "الأدمن" : "Admins", count: stats.admins },
    { key: "moderator", label: isAr ? "المشرفين" : "Mods", count: stats.mods },
    { key: "user", label: isAr ? "عملاء" : "Clients", count: stats.customers },
    { key: "stock", label: isAr ? "الاستوك" : "Stock", count: stats.stock },
  ];

  const askToggleRole = async (u: any, role: "admin" | "moderator", add: boolean) => {
    const name = u.display_name || u.email;
    const messages = {
      ar: {
        admin: add ? `تفعيل صلاحية الأدمن للمستخدم ${name}؟` : `إلغاء صلاحية الأدمن عن ${name}؟`,
        moderator: add
          ? `تفعيل صلاحية المشرف للمستخدم ${name}؟`
          : `إلغاء صلاحية المشرف عن ${name}؟`,
      },
      en: {
        admin: add ? `Grant admin role to ${name}?` : `Remove admin role from ${name}?`,
        moderator: add ? `Grant moderator role to ${name}?` : `Remove moderator role from ${name}?`,
      },
    };
    const ok = await confirm({
      message: messages[isAr ? "ar" : "en"][role],
      tone: add ? "default" : "danger",
    });
    if (!ok) return;
    toggleRole.mutate({ userId: u.id, role, add });
  };

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
  };

  return (
    <div>
      <AdminHero
        icon={Users}
        title={t.admin.users}
        subtitle={
          isAr
            ? `${stats.total} مستخدم • إدارة الصلاحيات والاستوك`
            : `${stats.total} users • roles & stock access`
        }
        actions={
          <HeroAction onClick={exportXlsx}>
            <Download className="size-4" />
            Excel
          </HeroAction>
        }
      />

      {/* ── Stats strip (same spirit as dashboard profile card) ── */}
      <div className="mt-3 rounded-3xl border border-brand/15 bg-card p-3 shadow-sm sm:mt-4 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatButton
            icon={Users}
            value={stats.total}
            label={isAr ? "إجمالي المستخدمين" : "Total users"}
            active={roleFilter === "all"}
            onClick={() => setRoleFilter("all")}
          />
          <StatButton
            icon={ShieldCheck}
            value={stats.admins}
            label={isAr ? "أدمن" : "Admins"}
            active={roleFilter === "admin"}
            onClick={() => setRoleFilter(roleFilter === "admin" ? "all" : "admin")}
          />
          <StatButton
            icon={Shield}
            value={stats.mods}
            label={isAr ? "مشرفين" : "Moderators"}
            active={roleFilter === "moderator"}
            onClick={() => setRoleFilter(roleFilter === "moderator" ? "all" : "moderator")}
          />
          <StatButton
            icon={Boxes}
            value={stats.stock}
            label={isAr ? "صلاحية استوك" : "Stock access"}
            active={roleFilter === "stock"}
            onClick={() => setRoleFilter(roleFilter === "stock" ? "all" : "stock")}
          />
        </div>
      </div>

      {/* ── Sticky filter bar (same spirit as /shop) ── */}
      <div
        className="sticky z-30 mt-3 border-y border-border/60 bg-background/95 backdrop-blur sm:mt-4"
        style={{ top: "var(--app-header-h, 56px)" }}
      >
        <div className="flex flex-col gap-2 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-full border border-border bg-card py-2.5 ps-9 pe-9 text-sm outline-none transition-colors focus:border-brand"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={isAr ? "مسح البحث" : "Clear search"}
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {roleTabs.map((tab) => (
              <SiteButton
                key={tab.key}
                variant="filter"
                size="filter"
                filterActive={roleFilter === tab.key}
                onClick={() => setRoleFilter(tab.key)}
                className="shrink-0"
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${roleFilter === tab.key ? "bg-white/25" : "bg-muted"
                    }`}
                >
                  {tab.count}
                </span>
              </SiteButton>
            ))}
          </div>
        </div>
      </div>

      {/* ── Result meta ── */}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {isAr
            ? `عرض ${filtered.length} من ${stats.total}`
            : `Showing ${filtered.length} of ${stats.total}`}
        </span>
        {(search || roleFilter !== "all") && (
          <button onClick={resetFilters} className="font-bold text-brand hover:underline">
            {isAr ? "مسح الفلاتر" : "Clear filters"}
          </button>
        )}
      </div>

      {/* ── Loading ── */}
      {users.isLoading && (
        <div className="mt-3 grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="size-12 shrink-0 animate-pulse rounded-full bg-muted/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-muted/60" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!users.isLoading && filtered.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-white shadow-lg">
            <Users className="size-6" />
          </span>
          <div className="mt-3 font-extrabold">
            {isAr ? "لا يوجد مستخدمين مطابقين" : "No matching users"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr ? "جرّب تغيير البحث أو الفلتر" : "Try adjusting search or filter"}
          </p>
          <SiteButton variant="outline" size="sm" onClick={resetFilters} className="mt-4">
            {isAr ? "عرض الكل" : "Show all"}
          </SiteButton>
        </div>
      )}

      {/* ── User cards (one responsive layout for desktop + mobile) ── */}
      {!users.isLoading && filtered.length > 0 && (
        <div className="mt-3 space-y-3">
          {filtered.map((u: any) => (
            <UserCard
              key={u.id}
              u={u}
              lang={lang}
              isAr={isAr}
              onToggleAdmin={() =>
                askToggleRole(
                  u,
                  "admin",
                  !u.user_roles?.some((r: any) => r.role === "admin"),
                )
              }
              onToggleMod={() =>
                askToggleRole(
                  u,
                  "moderator",
                  !u.user_roles?.some((r: any) => r.role === "moderator"),
                )
              }
              onStock={() => setStockUser(u)}
              onDelete={() => askDelete(u)}
              deleting={deleteUser.isPending}
            />
          ))}
        </div>
      )}

      {stockUser && (
        <StockAccessDialog
          user={stockUser}
          onClose={() => setStockUser(null)}
          onSaved={() => {
            setStockUser(null);
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
    </div>
  );
}

/* ── Stat button: dashboard mini-stat spirit ── */
function StatButton({
  icon: Icon,
  value,
  label,
  active,
  onClick,
}: {
  icon: any;
  value: number;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-center transition active:scale-95 ${active
          ? "border-brand/50 bg-brand/10"
          : "border-transparent bg-muted/50 hover:border-brand/40 hover:bg-brand/5"
        }`}
    >
      <span className="mx-auto mb-1 grid size-8 place-items-center rounded-full bg-white shadow-sm ring-1 ring-border/60">
        <Icon className="size-4 text-brand-deep" />
      </span>
      <span className="block text-lg font-black leading-tight text-brand-deep sm:text-xl">
        {value}
      </span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">{label}</span>
    </button>
  );
}

/* ── User card ── */
function UserCard({
  u,
  lang,
  isAr,
  onToggleAdmin,
  onToggleMod,
  onStock,
  onDelete,
  deleting,
}: {
  u: any;
  lang: string;
  isAr: boolean;
  onToggleAdmin: () => void;
  onToggleMod: () => void;
  onStock: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const isAdmin = u.user_roles?.some((r: any) => r.role === "admin");
  const isModerator = u.user_roles?.some((r: any) => r.role === "moderator");
  const src = (u.display_name || u.email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : src.slice(0, 2).toUpperCase();

  return (
    <article className="rounded-2xl border border-border bg-card p-4 transition hover:border-brand/30 hover:shadow-md sm:p-5">
      {/* top row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-base font-black text-white shadow sm:size-14 sm:text-lg">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-extrabold sm:text-lg">
              {u.display_name || "-"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <RolePill role={isAdmin ? "admin" : isModerator ? "moderator" : "user"} lang={lang} />
              {u.stock_access && <RolePill role="stock" lang={lang} />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <SiteButton
            variant="outline"
            size="sm"
            onClick={onToggleAdmin}
            className={
              isAdmin
                ? "!border-destructive/40 !text-destructive hover:!bg-destructive/10"
                : "!border-warning/50 !text-warning hover:!bg-warning/10"
            }
          >
            <ShieldCheck className="size-3.5" />
            {isAdmin ? (isAr ? "إلغاء أدمن" : "Remove admin") : isAr ? "جعله أدمن" : "Make admin"}
          </SiteButton>
          <SiteButton
            variant="outline"
            size="sm"
            onClick={onToggleMod}
            className={
              isModerator
                ? "!border-destructive/40 !text-destructive hover:!bg-destructive/10"
                : ""
            }
          >
            <Shield className="size-3.5" />
            {isModerator ? (isAr ? "إلغاء مشرف" : "Remove mod") : isAr ? "جعله مشرف" : "Make mod"}
          </SiteButton>
          <SiteButton
            variant="outline"
            size="sm"
            onClick={onStock}
            className={
              u.stock_access ? "!border-success/50 !text-success hover:!bg-success/10" : ""
            }
          >
            <Boxes className="size-3.5" />
            {isAr ? "استوك" : "Stock"}
          </SiteButton>
          <button
            onClick={onDelete}
            disabled={deleting}
            title={isAr ? "حذف المستخدم" : "Delete user"}
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-2 text-xs font-bold text-destructive transition hover:border-destructive/40 hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            {isAr ? "حذف" : "Delete"}
          </button>
        </div>
      </div>

      {/* info strip */}
      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <InfoChip icon={Mail} value={u.email} dir="ltr" />
        <InfoChip icon={Phone} value={u.phone} dir="ltr" />
        <InfoChip icon={MapPin} value={u.country || (isAr ? "بدون دولة" : "No country")} />
        <InfoChip
          icon={Calendar}
          value={u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
        />
      </div>
    </article>
  );
}

/* ── Role pill ── */
function RolePill({ role, lang }: { role: string; lang: string }) {
  const isAr = lang === "ar";
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    admin: {
      label: isAr ? "أدمن" : "admin",
      cls: "bg-[#0b3fa0]/10 text-[#0b3fa0]",
      Icon: ShieldCheck,
    },
    moderator: {
      label: isAr ? "مشرف" : "moderator",
      cls: "bg-brand/10 text-brand",
      Icon: Shield,
    },
    user: {
      label: isAr ? "عميل" : "client",
      cls: "bg-muted text-muted-foreground",
      Icon: User,
    },
    stock: {
      label: isAr ? "استوك" : "stock",
      cls: "bg-success/10 text-success",
      Icon: Boxes,
    },
  };
  const item = map[role] ?? map.user;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.cls}`}
    >
      <item.Icon className="size-3" />
      {item.label}
    </span>
  );
}

function InfoChip({ icon: Icon, value, dir }: { icon: any; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div
      dir={dir}
      className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"
    >
      <Icon className="size-3.5 shrink-0 text-brand-deep" />
      <span className="truncate">{value || "-"}</span>
    </div>
  );
}

function StockAccessDialog({
  user,
  onClose,
  onSaved,
}: {
  user: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, notify } = useApp();
  const isAr = lang === "ar";
  const [access, setAccess] = useState<boolean>(!!user.stock_access);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("admin_set_stock_access", {
        _user_id: user.id,
        _access: access,
        _password: "",
      });
      if (error) throw error;
      notify(isAr ? "تم الحفظ" : "Saved", "success");
      onSaved();
    } catch (e: any) {
      notify(e?.message ?? "خطأ", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-auto w-full max-w-md overflow-hidden rounded-3xl border border-brand/15 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* dialog hero */}
        <div className="relative bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] p-5 text-white">
          <button
            onClick={onClose}
            aria-label={isAr ? "إغلاق" : "Close"}
            className="absolute top-3 end-3 grid size-8 place-items-center rounded-full bg-white/20 transition hover:bg-white/30"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white shadow ring-2 ring-white">
              <Boxes className="size-6 text-[#0b3fa0]" />
            </span>
            <div className="min-w-0">
              <div className="font-extrabold">{isAr ? "صلاحية الاستوك" : "Stock Access"}</div>
              <div className="max-w-[220px] truncate text-xs text-white/85">
                {user.display_name || user.email}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <button
            type="button"
            onClick={() => setAccess(!access)}
            className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background p-4 text-start transition hover:border-brand/40"
          >
            <span
              className={`mt-0.5 grid h-6 w-11 shrink-0 place-items-center rounded-full transition ${access ? "bg-gradient-to-l from-[#0b3fa0] to-[#00a9e0]" : "bg-muted"
                }`}
            >
              <span
                className={`size-5 rounded-full bg-white shadow transition-transform ${access ? "-translate-x-2.5 rtl:translate-x-2.5" : "translate-x-2.5 rtl:-translate-x-2.5"
                  }`}
              />
            </span>
            <span>
              <span className="block text-sm font-bold">
                {isAr ? "السماح بالدخول لصفحة الاستوك" : "Allow access to stock page"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isAr
                  ? "المستخدم هيدخل على /stock بحسابه على الويب سايت مباشرة، بدون اسم مستخدم أو كلمة سر إضافية."
                  : "The user signs into /stock with their website account - no extra username or password needed."}
              </span>
            </span>
          </button>

          <div className="flex gap-2">
            <SiteButton
              variant="primary"
              size="pill"
              onClick={save}
              disabled={loading}
              className="flex-1"
            >
              {loading ? "..." : isAr ? "حفظ" : "Save"}
            </SiteButton>
            <SiteButton variant="outline" size="pill" onClick={onClose}>
              {isAr ? "إلغاء" : "Cancel"}
            </SiteButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
