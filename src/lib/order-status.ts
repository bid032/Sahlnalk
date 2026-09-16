export type OrderStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "paid"
  | "cancelled"
  | "canceled"
  | "refunded"
  | "failed"
  | string;

export interface StatusConfig {
  label: string;
  shortLabel: string;
  icon: string;
  badgeClass: string;
  borderClass: string;
  cardClass: string;
  selectOptionClass: string;
}

export function getOrderStatusConfig(status: string, lang: "ar" | "en" = "ar"): StatusConfig {
  const s = (status || "").toLowerCase().trim();

  switch (s) {
    case "pending":
      return {
        label: lang === "ar" ? "طلب جديد (قيد الانتظار)" : "Pending (New)",
        shortLabel: lang === "ar" ? "طلب جديد" : "Pending",
        icon: "",
        badgeClass: "bg-amber-500/15 text-amber-600 border border-amber-500/40 font-black",
        borderClass: "border-r-4 border-r-amber-500",
        cardClass: "border-amber-500/40 bg-amber-500/5",
        selectOptionClass: "text-amber-500 font-bold",
      };

    case "processing":
      return {
        label: lang === "ar" ? "جاري التجهيز" : "Processing",
        shortLabel: lang === "ar" ? "جاري التجهيز" : "Processing",
        icon: "",
        badgeClass: "bg-sky-500/15 text-sky-600 border border-sky-500/40 font-black",
        borderClass: "border-r-4 border-r-sky-500",
        cardClass: "border-sky-500/30 bg-sky-500/5",
        selectOptionClass: "text-sky-600 font-bold",
      };

    case "delivered":
      return {
        label: lang === "ar" ? "تم التسليم" : "Delivered",
        shortLabel: lang === "ar" ? "تم التسليم" : "Delivered",
        icon: "",
        badgeClass: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 font-black",
        borderClass: "border-r-4 border-r-emerald-500",
        cardClass: "border-emerald-500/30 bg-emerald-500/5",
        selectOptionClass: "text-emerald-600 font-bold",
      };

    case "paid":
      return {
        label: lang === "ar" ? "تم الدفع" : "Paid",
        shortLabel: lang === "ar" ? "تم الدفع" : "Paid",
        icon: "",
        badgeClass: "bg-indigo-500/15 text-indigo-600 border border-indigo-500/40 font-black",
        borderClass: "border-r-4 border-r-indigo-500",
        cardClass: "border-indigo-500/30 bg-indigo-500/5",
        selectOptionClass: "text-indigo-600 font-bold",
      };

    case "cancelled":
    case "canceled":
      return {
        label: lang === "ar" ? "ملغى" : "Cancelled",
        shortLabel: lang === "ar" ? "ملغى" : "Cancelled",
        icon: "",
        badgeClass: "bg-rose-500/15 text-rose-600 border border-rose-500/40 font-black",
        borderClass: "border-r-4 border-r-rose-500",
        cardClass: "border-rose-500/30 bg-rose-500/5 opacity-85",
        selectOptionClass: "text-rose-600 font-bold",
      };

    case "refunded":
      return {
        label: lang === "ar" ? "تم الاسترداد" : "Refunded",
        shortLabel: lang === "ar" ? "تم الاسترداد" : "Refunded",
        icon: "",
        badgeClass: "bg-purple-500/15 text-purple-600 border border-purple-500/40 font-black",
        borderClass: "border-r-4 border-r-purple-500",
        cardClass: "border-purple-500/30 bg-purple-500/5",
        selectOptionClass: "text-purple-600 font-bold",
      };

    case "failed":
      return {
        label: lang === "ar" ? "فشل العملية" : "Failed",
        shortLabel: lang === "ar" ? "فشل العملية" : "Failed",
        icon: "",
        badgeClass: "bg-red-600/15 text-red-600 border border-red-600/40 font-black",
        borderClass: "border-r-4 border-r-red-600",
        cardClass: "border-red-600/30 bg-red-600/5 opacity-85",
        selectOptionClass: "text-red-600 font-bold",
      };

    default:
      return {
        label: status || (lang === "ar" ? "غير معروف" : "Unknown"),
        shortLabel: status || (lang === "ar" ? "غير معروف" : "Unknown"),
        icon: "",
        badgeClass: "bg-muted text-muted-foreground border border-border font-bold",
        borderClass: "border-r-4 border-r-border",
        cardClass: "border-border",
        selectOptionClass: "text-muted-foreground",
      };
  }
}
