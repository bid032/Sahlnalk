import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, RefreshCw, KeyRound } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { AdminHero, HeroGlass } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: AdminStaff,
});

function AdminStaff() {
  const { notify } = useApp();
  const qc = useQueryClient();

  const sheetQ = useQuery({
    queryKey: ["stock-sheet-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "stock_sheet").maybeSingle();
      return (data?.value as any) ?? { spreadsheet_id: "", sheet_title: "" };
    },
  });
  const [stockSheet, setStockSheet] = useState<{ spreadsheet_id: string; sheet_title: string }>({ spreadsheet_id: "", sheet_title: "" });
  useEffect(() => {
    if (sheetQ.data) setStockSheet({ spreadsheet_id: sheetQ.data.spreadsheet_id ?? "", sheet_title: sheetQ.data.sheet_title ?? "" });
  }, [sheetQ.data]);

  const saveSheet = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_settings").upsert([{ key: "stock_sheet", value: stockSheet }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-sheet-setting"] });
      notify("تم حفظ ربط الشيت", "success");
    },
    onError: (e: any) => notify(e?.message ?? "فشل الحفظ", "error"),
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <AdminHero
        icon={KeyRound}
        title="الاستوك"
        subtitle={<>اربط شيت جوجل الخاص ببيانات الاستوك - صفحة /stock بتقرأ منه تلقائي</>}
        actions={
          <HeroGlass>
            <button onClick={() => sheetQ.refetch()} className="inline-flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 ${sheetQ.isFetching ? "animate-spin" : ""}`} /> تحديث
            </button>
          </HeroGlass>
        }
      />

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base">ربط شيت الاستوك</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              ألصق رابط شيت جوجل أو الـ Spreadsheet ID.
            </p>
          </div>
          <button
            onClick={() => saveSheet.mutate()}
            disabled={saveSheet.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-brand-foreground font-extrabold hover:brand-glow disabled:opacity-60 text-sm"
          >
            <Save className="w-4 h-4" /> {saveSheet.isPending ? "..." : "حفظ الربط"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-muted-foreground">Spreadsheet ID أو الرابط</label>
          <input
            placeholder="https://docs.google.com/..."
            value={stockSheet.spreadsheet_id ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const m = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
              setStockSheet({ ...stockSheet, spreadsheet_id: m ? m[1] : raw });
            }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}
