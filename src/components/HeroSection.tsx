import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Zap,
  Sparkles,
  X,
  ArrowUpRight,
  MessageCircle,
  Search,
  Radio,
  BadgeCheck,
} from "lucide-react";
import { SiteButton } from "@/components/ui/site-button";
import type { ProductCardData } from "@/components/ProductCard";
import { QuickBuyDialog } from "@/components/QuickBuyDialog";
import { useApp } from "@/contexts/AppContext";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

export interface HeroSectionProps {
  heroSetting?: Record<string, any> | null;
  brandSetting?: Record<string, any> | null;
  contactSetting?: Record<string, any> | null;
  statsSetting?: Record<string, number> | null;
  featuredProducts?: ProductCardData[];
  allProducts?: ProductCardData[];
}

export interface HeroServiceCard {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  subtitle_ar: string;
  category: "ai" | "design" | "entertainment";
  originalPrice: string;
  price: number;
  iconUrl?: string | null;
  iconEmoji?: string;
  badge?: string;
  dbProduct?: ProductCardData | null;
  connectY: number;
}

const DEFAULT_SERVICES: HeroServiceCard[] = [
  {
    id: "chatgpt",
    slug: "chatgpt-plus",
    name_ar: "ChatGPT Plus (GPT-4o)",
    name_en: "ChatGPT Plus (GPT-4o)",
    subtitle_ar: "أسرع طريقة للتفعيل على إيميلك الشخصي",
    category: "ai",
    originalPrice: "1,050 ج.م",
    price: 380,
    iconEmoji: "🤖",
    badge: "خصم 64%",
    connectY: 35,
  },
  {
    id: "midjourney",
    slug: "midjourney-v6",
    name_ar: "Midjourney V6 Pro",
    name_en: "Midjourney V6 Pro",
    subtitle_ar: "توليد صور بجودة 8K بدون حدود",
    category: "design",
    originalPrice: "1,550 ج.م",
    price: 420,
    iconEmoji: "🎨",
    badge: "توليد 8K",
    connectY: 115,
  },
  {
    id: "canva",
    slug: "canva-pro",
    name_ar: "Canva Pro (حساب خاص)",
    name_en: "Canva Pro (Private Account)",
    subtitle_ar: "أدوات الذكاء الاصطناعي وتصميمات احترافية",
    category: "design",
    originalPrice: "680 ج.م",
    price: 190,
    iconEmoji: "✨",
    badge: "وفر 72%",
    connectY: 190,
  },
  {
    id: "adobe",
    slug: "adobe-creative-cloud",
    name_ar: "Adobe Creative Cloud",
    name_en: "Adobe Creative Cloud",
    subtitle_ar: "الحزمة الكاملة لأكثر من 20 تطبيق أصلي",
    category: "design",
    originalPrice: "2,850 ج.م",
    price: 650,
    iconEmoji: "🚀",
    badge: "الحزمة الكاملة",
    connectY: 265,
  },
  {
    id: "claude",
    slug: "claude-pro",
    name_ar: "Claude 3.5 Sonnet",
    name_en: "Claude 3.5 Sonnet",
    subtitle_ar: "أعلى دقة في البرمجة وتحليل البيانات",
    category: "ai",
    originalPrice: "1,050 ج.م",
    price: 390,
    iconEmoji: "🧠",
    badge: "للبرمجة والتحليل",
    connectY: 340,
  },
];

export function HeroSection({
  heroSetting,
  brandSetting,
  contactSetting,
  allProducts = [],
}: HeroSectionProps) {
  const { lang } = useApp();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);

  // Mouse Parallax Physics State
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMouseInside, setIsMouseInside] = useState(false);

  // Active Hovered Card for SVG Curve Lighting
  const [hoveredCardId, setHoveredCardId] = useState<string>("chatgpt");

  // Modals & Search
  const [buyProduct, setBuyProduct] = useState<ProductCardData | null>(null);
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const whatsappPhone =
    (contactSetting?.whatsapp as string | undefined)?.replace(/\D/g, "") ||
    (contactSetting?.whatsapp_number as string | undefined)?.replace(/\D/g, "") ||
    "201080720640";

  const h = heroSetting ?? {};
  const b = brandSetting ?? {};

  // Dynamic values from Admin Dashboard with fallbacks
  const badgeText =
    ((lang === "ar" ? h.badge_ar : h.badge_en) as string | undefined)?.trim() ||
    (lang === "ar"
      ? "تفعيل رسمي أصلي 100% • أسعار بالجنيه المصري"
      : "100% Genuine Activation • Prices in EGP");

  const titleText =
    ((lang === "ar" ? h.title_ar : h.title_en) as string | undefined)?.trim() ||
    (lang === "ar"
      ? "اشتراكاتك الرقمية بالجنيه المصري.. أصيلة، فورية، وبدون فيزا دولار."
      : "Genuine Digital Subscriptions in EGP — Instant & Hassle-Free.");

  const subtitleText =
    ((lang === "ar" ? h.subtitle_ar : h.subtitle_en) as string | undefined)?.trim() ||
    (lang === "ar"
      ? "تفعيل مباشر على إيميلك الشخصي خلال دقائق. وفر حتى 70% على أشهر منصات الذكاء الاصطناعي والتصميم مع ضمان استبدال شامل."
      : "Instant activation on your personal email in minutes. Save up to 70% on top AI & design tools with full warranty.");

  const brandName =
    ((lang === "ar" ? b.name_ar : b.name_en) as string | undefined)?.trim() ||
    (lang === "ar" ? "سهلنالك" : "Sahlnalk");

  const brandTagline =
    ((lang === "ar" ? b.tagline_ar : b.tagline_en) as string | undefined)?.trim() ||
    (lang === "ar" ? "مركز الحسابات الرسمية" : "Official Subscriptions Hub");

  const avatarUrl = b.avatar_url || "/pp.webp";

  // Dynamic or fallback hero services list
  const rawServices: HeroServiceCard[] = useMemo(() => {
    if (Array.isArray(h.services) && h.services.length > 0) {
      return h.services;
    }
    return DEFAULT_SERVICES;
  }, [h.services]);

  // Merge database products
  const mergedServices = useMemo(() => {
    return rawServices.map((preset, idx) => {
      const dbMatch = allProducts.find(
        (p) =>
          (preset.slug && p.slug === preset.slug) ||
          (preset.id && p.id === preset.id) ||
          (preset.id && p.name_ar && p.name_ar.toLowerCase().includes(preset.id)) ||
          (preset.id && p.name_en && p.name_en.toLowerCase().includes(preset.id))
      );

      let calcPrice = preset.price ?? 0;
      let calcOld = preset.originalPrice;

      if (dbMatch && dbMatch.minPrice !== null) {
        const discount = Number(dbMatch.discount_percent ?? 0);
        const hasDiscount = discount > 0;
        const finalPrice = hasDiscount
          ? Math.round(dbMatch.minPrice * (100 - discount)) / 100
          : dbMatch.minPrice;

        calcPrice = finalPrice;

        const compareAt =
          dbMatch.cheapestPlanComparePrice && dbMatch.cheapestPlanComparePrice > finalPrice
            ? dbMatch.cheapestPlanComparePrice
            : null;

        const oldPriceNum =
          compareAt ?? (hasDiscount && dbMatch.minPrice > finalPrice ? dbMatch.minPrice : null);

        calcOld = oldPriceNum !== null ? `${oldPriceNum} ج.م` : "";
      }

      return {
        ...preset,
        id: dbMatch?.id || preset.id || `card_${idx}`,
        slug: dbMatch?.slug || preset.slug,
        name_ar: dbMatch?.name_ar || preset.name_ar || "",
        name_en: dbMatch?.name_en || preset.name_en || "",
        subtitle_ar: preset.subtitle_ar || "تفعيل فوري ورسمي 100%",
        price: calcPrice,
        originalPrice: calcOld,
        iconUrl: dbMatch?.icon_url || preset.iconUrl || null,
        badge: dbMatch?.discount_percent ? `خصم ${dbMatch.discount_percent}%` : preset.badge,
        dbProduct: dbMatch || null,
        connectY: preset.connectY ?? (35 + idx * 75),
      };
    });
  }, [rawServices, allProducts]);

  useEffect(() => {
    if (mergedServices.length > 0 && !mergedServices.some((s) => s.id === hoveredCardId)) {
      setHoveredCardId(mergedServices[0].id);
    }
  }, [mergedServices, hoveredCardId]);

  // Search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter((p) => {
        const ar = (p.name_ar ?? "").toLowerCase();
        const en = (p.name_en ?? "").toLowerCase();
        return ar.includes(q) || en.includes(q);
      })
      .slice(0, 5);
  }, [searchQuery, allProducts]);

  // Handle Mouse Move for Parallax Physics & Cursor Glow Spotlight
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    setIsMouseInside(true);
  };

  const handleMouseLeave = () => {
    setIsMouseInside(false);
  };

  const handleBuyClick = (card: HeroServiceCard) => {
    if (card.dbProduct) {
      setBuyProduct(card.dbProduct);
      setBuyDialogOpen(true);
    } else {
      navigate({ to: "/product/$slug", params: { slug: card.slug } });
    }
  };

  // Parallax offsets for orbital badges
  const parallaxX = stageRef.current ? (mousePos.x - stageRef.current.clientWidth / 2) * 0.04 : 0;
  const parallaxY = stageRef.current ? (mousePos.y - stageRef.current.clientHeight / 2) * 0.04 : 0;

  // Outer orbital positions mapping for dynamic service icons OUTSIDE the card
  const outerPositions = [
    { top: "-top-6", right: "-end-6", anim: "animate-card-drift-1", delay: "0s" },
    { top: "top-1/4", left: "-start-8", anim: "animate-card-drift-2", delay: "1.5s" },
    { bottom: "bottom-1/4", right: "-end-8", anim: "animate-card-drift-3", delay: "0.8s" },
    { bottom: "-bottom-6", left: "start-1/4", anim: "animate-card-drift-4", delay: "2s" },
    { top: "top-2/3", left: "-start-6", anim: "animate-card-drift-1", delay: "1.2s" },
  ];

  return (
    <section className="relative w-full overflow-hidden py-4 sm:py-6 lg:py-8 select-none">
      <div className="mx-auto w-full max-w-[94rem] px-3 sm:px-6">
        {/* ── GRADIENT HERO STAGE CONTAINER ── */}
        <div
          ref={stageRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#00b4d8] via-[#0284c7] to-[#03045e] text-white p-6 sm:p-10 lg:p-12 backdrop-blur-md transition-all"
        >
          {/* Dynamic Cursor Light Spotlight */}
          {isMouseInside && (
            <div
              style={{
                left: `${mousePos.x}px`,
                top: `${mousePos.y}px`,
              }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-cyan-300/20 blur-3xl transition-all duration-150 ease-out"
            />
          )}

          {/* 3-Column Balanced Layout */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">

            {/* ── 1. RIGHT COLUMN (على اليمين): HERO COPYWRITING & TEXT ── */}
            <div className="lg:col-span-5 flex flex-col text-start justify-center space-y-5 relative z-20">

              {/* Dynamic Trust Badge */}
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-xs font-black text-white shadow-xs backdrop-blur-md">
                <Radio className="size-3.5 text-white animate-pulse" />
                <span>{badgeText}</span>
              </div>

              {/* Dynamic Headline */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-sm">
                {titleText}
              </h1>

              {/* Dynamic Subtitle */}
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-medium">
                {subtitleText}
              </p>

              {/* Instant Search Bar */}
              <div className="w-full relative pt-1">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (searchQuery.trim()) navigate({ to: "/shop" });
                  }}
                  className="relative"
                >
                  <div className="group relative flex items-center rounded-2xl border border-white/40 bg-white text-slate-900 p-1.5 shadow-xl transition-all focus-within:ring-2 focus-within:ring-white/40">
                    <Search className="ms-3 size-4 text-slate-400 group-focus-within:text-[#0284c7]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsSearching(true)}
                      placeholder={
                        lang === "ar"
                          ? "ابحث عن اشتراكك (ChatGPT, Canva, Netflix)..."
                          : "Search subscription (ChatGPT, Canva)..."
                      }
                      className="w-full bg-transparent px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="p-1 text-slate-400 hover:text-slate-900"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                    <SiteButton
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="ms-1 shrink-0 rounded-xl px-4 py-2 text-xs font-black bg-[#0284c7] text-white hover:bg-[#0369a1] shadow-xs"
                    >
                      <span>{lang === "ar" ? "ابحث" : "Search"}</span>
                    </SiteButton>
                  </div>

                  {/* Instant Search Dropdown */}
                  {isSearching && searchResults.length > 0 && (
                    <div className="absolute top-full start-0 z-50 mt-1.5 w-full overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl">
                      {searchResults.map((p) => (
                        <Link
                          key={p.id}
                          to="/product/$slug"
                          params={{ slug: p.slug }}
                          className="flex items-center justify-between rounded-xl p-2 hover:bg-muted/70 transition-colors"
                          onClick={() => {
                            setSearchQuery("");
                            setIsSearching(false);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {p.icon_url ? (
                              <img src={p.icon_url} alt="" className="size-7 rounded-lg object-cover border border-border" />
                            ) : (
                              <div className="grid size-7 place-items-center rounded-lg bg-[#0284c7]/10 text-[#0284c7] font-black text-xs">
                                ⭐
                              </div>
                            )}
                            <span className="text-xs font-black text-foreground">{lang === "ar" ? p.name_ar : p.name_en}</span>
                          </div>
                          <span className="text-xs font-black text-[#0284c7]">{p.minPrice} ج.م</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href={`https://wa.me/${whatsappPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-xs sm:text-sm font-black text-[#0284c7] shadow-xl hover:bg-white/95 hover:scale-105 transition-all"
                >
                  <WhatsAppIcon className="size-4 fill-[#0284c7] text-white group-hover:rotate-12 transition-transform" />
                  <span>{lang === "ar" ? "تواصل على واتساب" : "Contact on WhatsApp"}</span>
                </a>

                <Link
                  to="/shop"
                  className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/30 bg-white/10 px-5 py-3.5 text-xs sm:text-sm font-black text-white hover:bg-white/20 transition-all backdrop-blur-md"
                >
                  <span>{lang === "ar" ? "تصفح كل الاشتراكات" : "Browse All"}</span>
                </Link>
              </div>

            </div>

            {/* ── 2. CENTER COLUMN (في النصف): OUTSIDE FLOATING SERVICE ICONS & FRAME ── */}
            <div className="lg:col-span-3 flex justify-center relative py-4 lg:py-0">

              {/* Dynamic SVG Circuit Tree Lines matching exact Red Sketch geometry */}
              <svg
                className="hidden lg:block absolute inset-0 size-full pointer-events-none z-10 overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Main Central Glowing Junction Circle at Logo Card Left Edge */}
                <circle cx="20" cy="185" r="4.5" fill="#ffffff" className="animate-pulse" />

                {mergedServices.slice(0, 4).map((card, idx) => {
                  const isActive = hoveredCardId === card.id;

                  // Precision Circuit Tree Branch Paths anchored directly into card edges:
                  // Origin at left edge of logo frame (x = 20, y = 185).
                  // Trunk extends horizontally along y = 185 (middle row gap).
                  // Branch 0 & 2: Gemini & Claude column center (x = -105)
                  // Branch 1 & 3: ChatGPT & Office Key column center (x = -260)
                  const branchPaths = [
                    // Card 0 (Top Right - Gemini): Curves UP into bottom-center of Gemini
                    { path: "M 20 185 L -85 185 C -100 185, -105 175, -105 152", targetX: -105, targetY: 152 },
                    // Card 1 (Top Left - ChatGPT): Curves UP into bottom-center of ChatGPT
                    { path: "M 20 185 L -240 185 C -255 185, -260 175, -260 152", targetX: -260, targetY: 152 },
                    // Card 2 (Bottom Right - Claude): Curves DOWN into top-center of Claude
                    { path: "M 20 185 L -85 185 C -100 185, -105 195, -105 218", targetX: -105, targetY: 218 },
                    // Card 3 (Bottom Left - Office Key): Curves DOWN into top-center of Office Key
                    { path: "M 20 185 L -240 185 C -255 185, -260 195, -260 218", targetX: -260, targetY: 218 },
                  ];

                  const branch = branchPaths[idx % 4];

                  return (
                    <g key={card.id}>
                      <path
                        d={branch.path}
                        fill="none"
                        stroke={isActive ? "#ffffff" : "rgba(255,255,255,0.6)"}
                        strokeWidth={isActive ? "3" : "2"}
                        strokeDasharray={isActive ? "none" : "4 4"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-300"
                      />
                      {/* Connection Target Node on the card */}
                      <circle
                        cx={branch.targetX}
                        cy={branch.targetY}
                        r={isActive ? "5.5" : "3.5"}
                        fill="#ffffff"
                        className={isActive ? "animate-ping" : ""}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Relative Outer Wrapper for Floating Icons Outside Card */}
              <div className="relative group">

                {/* Dynamic Floating Service Icons OUTSIDE Card Bounds */}
                {mergedServices.slice(0, 5).map((service, index) => {
                  const pos = outerPositions[index % outerPositions.length];
                  const isHovered = hoveredCardId === service.id;

                  return (
                    <div
                      key={service.id}
                      style={{
                        transform: `translate(${parallaxX * (0.9 + index * 0.25)}px, ${parallaxY * (0.9 + index * 0.25)}px)`,
                        animationDelay: pos.delay,
                      }}
                      onMouseEnter={() => setHoveredCardId(service.id)}
                      className={`absolute z-30 grid size-11 place-items-center rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 cursor-pointer ${pos.anim} ${pos.top || ""} ${pos.bottom || ""} ${pos.left || ""} ${pos.right || ""} ${isHovered
                        ? "scale-125 border-white bg-white text-slate-900 ring-4 ring-cyan-300/60 shadow-2xl z-40"
                        : "bg-white/20 border-white/40 text-white hover:scale-110 hover:bg-white/30"
                        }`}
                      title={lang === "ar" ? service.name_ar : service.name_en}
                    >
                      {service.iconUrl ? (
                        <img src={service.iconUrl} alt="" className="size-7 object-cover rounded-xl" />
                      ) : (
                        <span className="text-lg font-bold">{service.iconEmoji || "⚡"}</span>
                      )}
                    </div>
                  );
                })}

                {/* Central Glass Frame */}
                <div
                  style={{
                    transform: `translate(${parallaxX * 0.5}px, ${parallaxY * 0.5}px)`,
                  }}
                  className="relative w-60 h-[21rem] sm:w-68 sm:h-[23rem] rounded-3xl border-2 border-white/30 bg-white/10 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md flex flex-col items-center justify-between overflow-hidden transition-all duration-300 group-hover:border-white"
                >
                  {/* Glowing Aura */}
                  <div aria-hidden className="absolute -inset-10 bg-gradient-to-tr from-cyan-300/30 via-white/20 to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />

                  {/* Center 3D Tilted Photo Frame & Name / Tagline */}
                  <div className="flex flex-col items-center justify-start text-center z-10 w-full h-full">

                    {/* Enlarged Photo Card Frame (Extended Downwards) */}
                    <div className="relative w-48 h-50 sm:w-52 sm:h-54 rounded-2xl border-2 border-white/40 bg-white/10 p-1 shadow-2xl backdrop-blur-md transition-all duration-300 group-hover:scale-105 group-hover:-rotate-1 -rotate-2 overflow-hidden mt-0.5 shrink-0">
                      <img
                        src={avatarUrl}
                        alt="Sahlnalk Profile"
                        className="w-full h-full object-cover rounded-xl"
                        onError={(e) => {
                          e.currentTarget.src = "/pp.webp";
                        }}
                      />
                      {/* Subtle Bottom gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0284c7]/40 via-transparent to-transparent pointer-events-none rounded-xl" />
                    </div>

                    {/* Name & Tagline (Shifted Downwards) */}
                    <div className="mt-6 sm:mt-7 flex flex-col items-center gap-1.5">
                      <div className="flex items-center justify-center gap-2">
                        <h3 className="text-xl sm:text-2xl font-black text-white tracking-wide drop-shadow-lg">
                          {brandName}
                        </h3>
                        <BadgeCheck className="size-5 sm:size-6 text-white fill-cyan-400 shrink-0 shadow-md" />
                      </div>

                      <span className="text-xs sm:text-sm font-black text-white bg-white/20 border border-white/35 px-3.5 py-1 rounded-full backdrop-blur-md shadow-sm">
                        {brandTagline}
                      </span>
                    </div>

                  </div>

                </div>
              </div>
            </div>

            {/* ── 3. LEFT COLUMN (على الشمال): EQUAL SPACING 2x2 GRID SHIFTED CLOCKWISE/RIGHT TOWARDS LOGO ── */}
            <div className="lg:col-span-4 flex justify-center items-center relative z-20">
              <div className="grid grid-cols-2 gap-3.5 sm:gap-4 w-full max-w-[300px] sm:max-w-[330px] h-[21rem] sm:h-[23rem] items-center relative lg:-ms-4">
                {mergedServices.slice(0, 4).map((card) => {
                  const isActive = hoveredCardId === card.id;

                  return (
                    <div
                      key={card.id}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onClick={() => handleBuyClick(card)}
                      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-2.5 sm:p-3 transition-all duration-300 flex flex-col items-center text-center justify-center aspect-square ${isActive
                        ? "bg-white text-slate-900 border-white shadow-2xl scale-[1.04] ring-2 ring-white/70"
                        : "bg-white/95 text-slate-900 border-white/80 shadow-md hover:bg-white hover:scale-[1.02]"
                        }`}
                    >
                      {/* 1. Image / Icon */}
                      {card.iconUrl ? (
                        <img
                          src={card.iconUrl}
                          alt=""
                          className="size-10 sm:size-11 rounded-xl object-cover border border-slate-200 shadow-2xs group-hover:scale-110 transition-transform mb-1.5"
                        />
                      ) : (
                        <div className="grid size-10 sm:size-11 place-items-center rounded-xl bg-gradient-to-br from-[#0284c7]/20 to-[#0284c7]/10 text-xl font-bold text-[#0284c7] border border-[#0284c7]/20 mb-1.5">
                          {card.iconEmoji || "⚡"}
                        </div>
                      )}

                      {/* 2. Title */}
                      <h4 className="text-xs sm:text-[13px] font-black text-slate-900 tracking-tight truncate w-full group-hover:text-[#0284c7] transition-colors px-1">
                        {lang === "ar" ? card.name_ar : card.name_en}
                      </h4>

                      {/* 3. Price */}
                      <div className="mt-1 flex items-baseline gap-1">
                        {card.originalPrice && (
                          <span className="text-[9px] font-bold text-slate-400 line-through">
                            {card.originalPrice}
                          </span>
                        )}
                        <span className="text-xs sm:text-sm font-black text-[#0284c7] tracking-tight">
                          {card.price} <span className="text-[9px] font-bold text-slate-500">ج.م</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>


          </div>
        </div>

      </div>

      {/* Quick Buy Dialog */}
      {buyProduct && <QuickBuyDialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen} product={buyProduct} />}
    </section>
  );
}
