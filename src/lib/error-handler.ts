// Centralized error handling: converts raw Supabase / network / JS errors
// into short, friendly, bilingual messages for the UI.
//
// Usage:
//   import { friendlyErrorMessage, showError } from "@/lib/error-handler";
//   catch (e) { showError(e, notify, lang); }

import type { Lang } from "./i18n";

type NotifyFn = (message: string, type?: "success" | "error" | "info") => void;

type Pair = { ar: string; en: string };

const G: Record<string, Pair> = {
  network: {
    ar: "تعذّر الاتصال بالخادم. راجع الإنترنت وحاول تاني.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  unknown: {
    ar: "حصل خطأ غير متوقع. لو المشكلة استمرت تواصل معانا.",
    en: "Something went wrong. If it keeps happening, contact support.",
  },
  permission: {
    ar: "مفيش صلاحية لإتمام العملية دي.",
    en: "You don't have permission to perform this action.",
  },
  notFound: {
    ar: "العنصر المطلوب غير موجود أو تم حذفه.",
    en: "The requested item was not found.",
  },
  duplicate: {
    ar: "العنصر ده موجود بالفعل.",
    en: "This item already exists.",
  },
  validation: {
    ar: "البيانات المدخلة غير صحيحة. راجع الحقول وحاول تاني.",
    en: "The submitted data is invalid. Please review the fields.",
  },
  fileTooLarge: {
    ar: "حجم الملف كبير جدًا.",
    en: "The file is too large.",
  },
  storage: {
    ar: "تعذّر رفع الملف. حاول مرة أخرى.",
    en: "File upload failed. Please try again.",
  },
  rateLimit: {
    ar: "محاولات كتيرة في وقت قصير. استنى شوية وحاول تاني.",
    en: "Too many attempts. Please wait a moment and try again.",
  },
  // Auth
  invalidLogin: {
    ar: "البريد الإلكتروني أو كلمة السر غير صحيحة.",
    en: "Invalid email or password.",
  },
  emailNotConfirmed: {
    ar: "لسه ما أكدتش بريدك الإلكتروني. افتح رسالة التأكيد الأول.",
    en: "Please confirm your email before signing in.",
  },
  userExists: {
    ar: "في حساب مسجّل بالبريد ده بالفعل. جرّب تسجيل الدخول.",
    en: "An account with this email already exists. Try signing in.",
  },
  weakPassword: {
    ar: "كلمة السر ضعيفة. لازم تكون 6 أحرف على الأقل.",
    en: "Password is too weak. Use at least 6 characters.",
  },
  invalidEmail: {
    ar: "صيغة البريد الإلكتروني غير صحيحة.",
    en: "Please enter a valid email address.",
  },
  sameNewPassword: {
    ar: "كلمة السر الجديدة لازم تكون مختلفة عن القديمة.",
    en: "New password must be different from the old one.",
  },
  sessionExpired: {
    ar: "انتهت الجلسة. يرجى تسجيل الدخول من جديد.",
    en: "Your session has expired. Please sign in again.",
  },
  // Checkout / orders
  emptyCart: {
    ar: "السلة فارغة.",
    en: "Your cart is empty.",
  },
  outOfStock: {
    ar: "الكمية المطلوبة غير متاحة حاليًا في المخزون.",
    en: "The requested quantity is currently out of stock.",
  },
  paymentFailed: {
    ar: "فشل تأكيد الدفع. راجع البيانات وحاول تاني.",
    en: "Payment failed. Please review the details and try again.",
  },
};

function pick(key: keyof typeof G, lang: Lang) {
  return G[key][lang];
}

export function friendlyErrorMessage(err: unknown, lang: Lang = "ar"): string {
  if (!err) return pick("unknown", lang);

  // Extract message + code from various shapes.
  const anyErr = err as any;
  const rawMsg: string =
    (typeof err === "string" ? err : anyErr?.message) ??
    anyErr?.error_description ??
    anyErr?.error ??
    "";
  const code: string = anyErr?.code ?? anyErr?.error_code ?? anyErr?.name ?? "";
  const status: number | undefined = anyErr?.status ?? anyErr?.statusCode;
  const msg = String(rawMsg).toLowerCase();

  // Network
  if (
    code === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  ) return pick("network", lang);

  // Rate limit
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return pick("rateLimit", lang);
  }

  // Auth-specific
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) return pick("invalidLogin", lang);
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) return pick("emailNotConfirmed", lang);
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists")) {
    // Distinguish auth signup vs generic duplicate row
    if (msg.includes("user")) return pick("userExists", lang);
    return pick("duplicate", lang);
  }
  if (msg.includes("password should be") || msg.includes("weak password") || msg.includes("at least 6")) {
    return pick("weakPassword", lang);
  }
  if (msg.includes("unable to validate email") || msg.includes("invalid email") || msg.includes("valid email")) {
    return pick("invalidEmail", lang);
  }
  if (msg.includes("new password should be different") || msg.includes("same as the old")) {
    return pick("sameNewPassword", lang);
  }
  if (msg.includes("jwt expired") || msg.includes("session") && msg.includes("expired")) {
    return pick("sessionExpired", lang);
  }

  // Storage
  if (msg.includes("payload too large") || msg.includes("exceeded")) return pick("fileTooLarge", lang);
  if (msg.includes("storage") || msg.includes("upload")) return pick("storage", lang);

  // Postgres / PostgREST codes
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return pick("duplicate", lang);
  }
  if (code === "23503" || msg.includes("foreign key")) {
    return lang === "ar"
      ? "لا يمكن تنفيذ العملية لوجود عناصر مرتبطة."
      : "Cannot complete: related items still exist.";
  }
  if (code === "23502" || msg.includes("not-null") || msg.includes("null value")) {
    return pick("validation", lang);
  }
  if (code === "42501" || msg.includes("permission denied") || msg.includes("row-level security") || msg.includes("rls") || msg.includes("forbidden")) {
    return pick("permission", lang);
  }
  if (code === "PGRST116" || msg.includes("not found") || status === 404) {
    return pick("notFound", lang);
  }
  if (code === "PGRST301" || msg.includes("jwt")) {
    return pick("sessionExpired", lang);
  }

  // Domain-specific hints
  if (msg.includes("compliance_violation") || msg.includes("compliance violation")) {
    return lang === "ar"
      ? "تم رفض العملية من قِبل بايبال لأسباب تتعلق بسياسات الأمان أو الدولة. يرجى التجربة عبر حساب بايبال آخر أو بطاقة مختلفة."
      : "Transaction declined by PayPal compliance policies. Please try another card or PayPal account.";
  }
  if (msg.includes("instrument_declined") || msg.includes("card_declined")) {
    return lang === "ar"
      ? "تم رفض البطاقة البنكية. يرجى التأكد من بيانات الفيزا ورصيدها أو تجربة بطاقة أخرى."
      : "Card was declined. Please verify details or try another card.";
  }
  if (msg.includes("out of stock") || msg.includes("insufficient stock")) return pick("outOfStock", lang);
  if (msg.includes("cart") && msg.includes("empty")) return pick("emptyCart", lang);

  // 5xx server
  if (status && status >= 500) {
    return lang === "ar"
      ? "الخادم مش مستجيب حاليًا. حاول تاني بعد شوية."
      : "The server is temporarily unavailable. Please try again shortly.";
  }

  // Validation-shaped
  if (status === 400 || msg.includes("invalid") || msg.includes("required")) {
    return pick("validation", lang);
  }

  // Fall back to raw message when it's a short human sentence, else generic.
  if (rawMsg && rawMsg.length < 140 && !rawMsg.includes("{") && !rawMsg.includes("<")) {
    return rawMsg;
  }
  return pick("unknown", lang);
}

/**
 * Log the raw error to the console (for debugging) and show a friendly
 * bilingual toast to the user. Prefer this in all catch blocks.
 */
export function showError(err: unknown, notify: NotifyFn, lang: Lang = "ar") {
  // Keep the raw error visible for developers.
  console.error(err);
  notify(friendlyErrorMessage(err, lang), "error");
}
