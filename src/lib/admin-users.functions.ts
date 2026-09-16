import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string") throw new Error("userId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', context.userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) throw new Error("Forbidden");
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك الخاص");

    await supabase.from('user_roles').delete().eq('user_id', data.userId);
    await supabase.from('profiles').delete().eq('id', data.userId);

    return { ok: true };
  });

