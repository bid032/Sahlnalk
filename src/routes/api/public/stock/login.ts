import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stock/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { username?: string; password?: string } = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "بيانات الدخول غير صحيحة" }, { status: 400 });
        }

        const username = (body.username ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        if (!username || !password) {
          await new Promise((r) => setTimeout(r, 400));
          return Response.json({ ok: false, error: "أدخل اسم المستخدم وكلمة السر" }, { status: 400 });
        }

        const { fetchStaffFromSheet, verifyStaffPassword } = await import("@/lib/stock-auth.functions");
        let staff;
        try {
          staff = await fetchStaffFromSheet();
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "تعذر الاتصال بالشيت" }, { status: 500 });
        }

        const match = staff.find((s) => s.username && s.username.toLowerCase() === username && s.active);
        const ok = !!match && await verifyStaffPassword(password, match.password);
        if (!ok) {
          await new Promise((r) => setTimeout(r, 400));
          return Response.json({ ok: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
        }

        const { createStockSessionValue, stockSessionSetCookie } = await import("@/lib/stock-auth.server");
        const sessionValue = await createStockSessionValue(match.name);
        return Response.json(
          { ok: true, staffName: match.name },
          { headers: { "Set-Cookie": stockSessionSetCookie(sessionValue, request.url) } },
        );
      },
    },
  },
});