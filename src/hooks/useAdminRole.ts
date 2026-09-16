import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminRole = "admin" | "moderator";

export function useAdminRole(initialRoles?: AdminRole[]) {
  const q = useQuery({
    queryKey: ["current-user-admin-roles"],
    queryFn: async (): Promise<AdminRole[]> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .in("role", ["admin", "moderator"]);
      const fetchedRoles = (data ?? []).map((r: any) => r.role as AdminRole);
      if (typeof window !== "undefined" && fetchedRoles.length > 0) {
        try {
          sessionStorage.setItem("sahlnalk_admin_roles", JSON.stringify(fetchedRoles));
        } catch (_) {}
      }
      return fetchedRoles;
    },
    initialData: () => {
      if (initialRoles && initialRoles.length > 0) return initialRoles;
      if (typeof window !== "undefined") {
        try {
          const cached = sessionStorage.getItem("sahlnalk_admin_roles");
          if (cached) return JSON.parse(cached);
        } catch (_) {}
      }
      return undefined;
    },
    staleTime: 5 * 60_000,
  });

  const roles = q.data ?? initialRoles ?? [];
  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator");
  return {
    isAdmin,
    isModerator,
    // admins can do everything a moderator can
    canModerate: isAdmin || isModerator,
    isLoading: q.isLoading && !q.data,
  };
}
