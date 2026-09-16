import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InlineMarkdown } from "@/components/MarkdownContent";
import { CheckCircle2, ShieldCheck, Star, Truck, UserCheck } from "lucide-react";

export type ProductReviewRow = {
  id: string;
  reviewer_name: string;
  rating: number;
  body: string;
  created_at?: string;
};

export function useProductReviews(productId?: string, seedData?: ProductReviewRow[]) {
  return useQuery({
    queryKey: ["product-reviews", productId ?? ""],
    enabled: !!productId,
    initialData: seedData,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductReviewRow[]> => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_reviews")
        .select("id, reviewer_name, rating, body, created_at")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return seedData ?? [];
      return (data ?? []) as ProductReviewRow[];
    },
  });
}

export function ProductDescription({
  productName,
  description,
  isAr,
  facts,
}: {
  productName: string;
  description?: string | null;
  isAr: boolean;
  facts?: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-brand-deep sm:text-xl">
          {isAr ? `عن ${productName}` : `About ${productName}`}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-line sm:text-base">
          {description ? (
            <InlineMarkdown text={description} />
          ) : (
            <p className="text-muted-foreground">
              {isAr
                ? "لا يوجد وصف إضافي متوفر لهذه الخدمة."
                : "No additional description available."}
            </p>
          )}
        </div>
      </div>

      {facts && facts.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-black uppercase text-muted-foreground sm:text-sm">
            {isAr ? "تفاصيل الخدمة السريعة" : "Quick Features"}
          </h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-2 border-b border-border/30 pb-2">
                <dt className="text-xs font-bold text-muted-foreground">{f.label}</dt>
                <dd className="text-xs font-extrabold text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

export function ProductReviews({ isAr, productId }: { isAr: boolean; productId: string }) {
  const { data: reviews = [], isLoading } = useProductReviews(productId);

  const avg =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + Number(r.rating ?? 5), 0) / reviews.length).toFixed(1)
      : "5.0";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-5">
        <div>
          <h2 className="text-lg font-extrabold text-brand-deep sm:text-xl">
            {isAr ? "آراء وتقييمات العملاء" : "Customer Reviews"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr ? "تقييمات حقيقية من مشتري هذه الخدمة" : "Real ratings from verified buyers"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2 text-amber-600 dark:text-amber-400">
          <Star className="size-5 fill-current" />
          <span className="text-xl font-black tabular-nums">{avg}</span>
          <span className="text-xs text-muted-foreground">
            ({reviews.length} {isAr ? "تقييم" : "reviews"})
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
          <UserCheck className="mx-auto size-10 stroke-1 opacity-50 mb-2" />
          <p className="text-sm font-bold">
            {isAr ? "لا توجد تقييمات منشورة بعد لهذه الخدمة." : "No reviews yet for this product."}
          </p>
          <p className="text-xs mt-1">
            {isAr ? "كن أول من جرب وشارك تجربتك!" : "Be the first to share your experience!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-border/50 bg-background/50 p-4 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-extrabold text-foreground">{r.reviewer_name}</span>
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`size-3.5 ${
                        idx < Number(r.rating) ? "fill-current" : "text-border"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-foreground/80 sm:text-sm">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductDelivery({ deliveryType, isAr }: { deliveryType: string; isAr: boolean }) {
  const isInstant = deliveryType === "instant";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Truck className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-foreground">
            {isInstant
              ? isAr
                ? "تسليم فوري ومباشر"
                : "Instant Delivery"
              : isAr
                ? "تفعيل يدوي سرييع"
                : "Quick Manual Setup"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {isInstant
              ? isAr
                ? "يصلك كود/بيانات الاشتراك تلقائياً فور إتمام عملية الدفع مباشرة في صفحة الطلب والواتساب."
                : "You receive your account codes automatically upon completed payment."
              : isAr
                ? "يتم معالجة الطلب وتفعيله من فريق خدمة العملاء خلال 1 إلى 3 ساعات كحد أقصى."
                : "Orders are processed manually by customer service within 1 to 3 hours."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProductPolicy({ isAr }: { isAr: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-success/10 text-success">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-foreground">
            {isAr ? "سياسة الضمان والاستبدال" : "Warranty & Replacement Policy"}
          </h3>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span>
                {isAr
                  ? "ضمان كامل طوال فترة الاشتراك المحددة."
                  : "Full warranty coverage throughout the subscription period."}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span>
                {isAr
                  ? "استبدال فوري بدون تعقيدات في حال حدوث أي توقف أو خلل."
                  : "Instant replacement without hassle if any interruption occurs."}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span>
                {isAr
                  ? "دعم فني مباشر عبر واتساب لمساعدتك في التفعيل والتشغيل."
                  : "Direct WhatsApp support to help you set up and configure."}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}