import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Star, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { showError } from "@/lib/error-handler";
import { AdminHero, HeroAction } from "@/components/AdminHero";

export const Route = createFileRoute("/_authenticated/admin/testimonials")({
  component: AdminTestimonials,
});

function AdminTestimonials() {
  const qc = useQueryClient();
  const { confirm, notify, lang } = useApp();

  const list = useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonial_images")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.from("testimonial_images").insert({ image_url: url });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      notify(lang === "ar" ? "تمت الإضافة" : "Added", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("testimonial_images").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-testimonials"] }),
    onError: (e) => showError(e, notify, lang),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("testimonial_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      notify(lang === "ar" ? "تم الحذف" : "Deleted", "success");
    },
    onError: (e) => showError(e, notify, lang),
  });

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const url = URL.createObjectURL(file);
        const i = new Image();
        i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(url); };
        i.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Invalid image")); };
        i.src = url;
      });
      const actual = dims.w / dims.h;
      const target = 4 / 5;
      if (Math.abs(actual - target) / target > 0.02) {
        throw new Error(`نسبة الصورة لازم تكون 4:5. الصورة اللي رفعتها ${dims.w}×${dims.h}.`);
      }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("testimonial-images").upload(path, file, {
        cacheControl: "31536000, public, immutable", upsert: false, contentType: file.type,
      });

      if (upErr) throw upErr;
      const { data } = supabase.storage.from("testimonial-images").getPublicUrl(path);
      add.mutate(data.publicUrl);
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <AdminHero
        icon={Star}
        title="آراء العملاء"
        subtitle={`${list.data?.length ?? 0} صورة • بتظهر في سلايدر الصفحة الرئيسية`}
        actions={
          <HeroAction onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            {uploading ? "جاري الرفع..." : "إضافة صورة"}
          </HeroAction>
        }
      />
      <div className="h-3 sm:h-4" />

      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {uploadError && <p className="text-xs text-destructive mt-2">{uploadError}</p>}
        <p className="text-[11px] text-muted-foreground text-center">
          دوس "إضافة صورة" من الأعلى لرفع صورة جديدة - نسبة الصورة لازم تكون 4:5 (مثال: 800×1000 ، 1200×1500).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {list.data?.map((t) => (
          <div key={t.id} className="relative group bg-card border border-border rounded-2xl overflow-hidden">
            <img src={t.image_url} alt="" className="w-full aspect-[4/5] object-cover" />
            <div className="p-3 flex items-center justify-between gap-2">
              <button
                onClick={() => toggleActive.mutate({ id: t.id, is_active: !t.is_active })}
                className={`text-xs px-2 py-1 rounded font-bold ${t.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
              >
                {t.is_active ? "ظاهر" : "مخفي"}
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm({ message: "متأكد إنك عاوز تمسح الصورة دي؟", tone: "danger", confirmLabel: "احذف" });
                  if (ok) remove.mutate(t.id);
                }}
                className="text-xs text-destructive hover:underline"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        {list.data?.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground p-12 border border-dashed border-border rounded-2xl">
            لا توجد صور بعد. ارفع أول صورة من الأعلى.
          </div>
        )}
      </div>
    </div>
  );
}
