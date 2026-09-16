import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { trackContact } from "@/lib/meta-pixel";

const WHATSAPP_NUMBER = "201284234815";

export function WhatsAppFloat() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackContact("WhatsApp")}
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-24 start-5 md:bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 transition-transform duration-200 hover:scale-110 hover:shadow-[0_12px_30px_-8px_rgba(37,211,102,0.7)] focus:outline-none focus:ring-2 focus:ring-[#25D366]/60 active:scale-95"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-40" />
      <WhatsAppIcon className="relative h-7 w-7" />
    </a>
  );
}
