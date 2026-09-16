import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/contexts/AppContext";
import { testimonialImagesQuery } from "@/lib/public-queries";

export function Testimonials() {
  const { lang } = useApp();
  const isAr = lang === "ar";

  const { data: images } = useQuery(testimonialImagesQuery());

  if (!images || images.length === 0) return null;

  return (
    <section className="relative">
      {/* Blue glow at bottom, rising upward and fading out , only inside testimonials */}
      {/* Gradient glow disabled , uncomment to restore
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px] bg-gradient-to-t from-brand/35 via-cyan-300/15 to-transparent" />
      <div className="pointer-events-none absolute start-1/2 bottom-0 -translate-x-1/2 w-[1200px] h-[380px] bg-brand/25 rounded-full blur-3xl" />
      */}


      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 relative">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:gap-10 items-start">
          {/* ── Sticky intro column (same idea as FAQ) ── */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-brand">
              {isAr ? "كلام عملائنا" : "Customer words"}
              <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-black normal-case tracking-normal text-white tabular-nums">
                {images.length}
              </span>
            </p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold max-w-xl leading-tight">
              {isAr ? "جرّبوا سهلنالك وقالوا رأيهم" : "Tried Sahlnalk and shared their take"}
            </h2>
            <div className="mt-4 flex items-center gap-6">
              <div>
                <div className="text-3xl font-extrabold">
                  4.9<span className="text-brand">/5</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? "متوسط تقييمهم لينا" : "Their average rating"}
                </div>
              </div>
              <div className="h-10 w-px bg-border" />
              <div>
                <div className="text-3xl font-extrabold">2K+</div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? "عميل بيطلب مننا" : "Customers ordering with us"}
                </div>
              </div>
            </div>
            <p className="mt-4 hidden rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground lg:block">
              {isAr
                ? "سكرينات حقيقية من عملائنا، قلّب بالأسهم أو اسحب عشان تشوف الباقي."
                : "Real screenshots from our customers — use the arrows or drag to see more."}
            </p>
          </div>

          {/* ── Slider (untouched) ── */}
          <div className="min-w-0">
            <TestimonialsSlider images={images} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSlider({ images }: { images: { id: string; image_url: string }[] }) {
  // Duplicate so we can navigate infinitely without visible jumps
  const items = useMemo(() => (images.length < 3 ? [...images, ...images, ...images] : images), [images]);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Sequential loading state: track indices that are permitted to download
  const [loadedIndices, setLoadedIndices] = useState<Set<number>>(() => new Set([0, 1]));

  // Immediately prioritize current active slide and its immediate neighbors
  useEffect(() => {
    if (!items.length) return;
    const n = items.length;
    setLoadedIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      next.add((index + 1) % n);
      next.add((index - 1 + n) % n);
      return next;
    });
  }, [index, items.length]);

  // Progressive background loader: load un-loaded items one by one sequentially (200ms gap)
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    let timer: number;

    const loadNext = () => {
      setLoadedIndices((prev) => {
        if (prev.size >= items.length) return prev;

        let bestIdx = -1;
        let minDist = Infinity;
        const n = items.length;

        for (let i = 0; i < n; i++) {
          if (!prev.has(i)) {
            let dist = Math.abs(i - index);
            if (dist > n / 2) dist = n - dist;
            if (dist < minDist) {
              minDist = dist;
              bestIdx = i;
            }
          }
        }

        if (bestIdx !== -1) {
          const nextSet = new Set(prev);
          nextSet.add(bestIdx);
          return nextSet;
        }
        return prev;
      });

      if (!cancelled) {
        timer = window.setTimeout(loadNext, 200);
      }
    };

    timer = window.setTimeout(loadNext, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [index, items]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % items.length);
    }, 4500);
    return () => clearInterval(id);
  }, [items.length]);

  // Scroll-driven advance disabled -only wheel-over-slider advances (see below)

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + items.length) % items.length);
  const goRef = useRef(go);
  goRef.current = go;

  // Desktop: while hovering the slider, capture wheel , stop page scroll and step slides
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let acc = 0;
    let t: number | null = null;
    const onWheel = (e: WheelEvent) => {
      // Only hijack when a real mouse is hovering (desktop). Touch scroll unaffected.
      if (!paused.current) return;
      e.preventDefault();
      acc += e.deltaY || e.deltaX;
      if (t) return;
      t = window.setTimeout(() => {
        const v = acc; acc = 0; t = null;
        if (Math.abs(v) < 20) return;
        goRef.current(v > 0 ? 1 : -1);
      }, 80);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, []);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative h-[340px] md:h-[460px] flex items-center justify-center [perspective:1400px] overflow-hidden">
        {items.map((img, i) => {
          // Relative offset with wrap-around
          let offset = i - index;
          if (offset > items.length / 2) offset -= items.length;
          if (offset < -items.length / 2) offset += items.length;

          const abs = Math.abs(offset);
          const hidden = abs > 2;
          const translateX = offset * 42; // percent
          const scale = abs === 0 ? 1 : abs === 1 ? 0.82 : 0.66;
          const rotateY = offset === 0 ? 0 : offset > 0 ? -22 : 22;
          const opacity = hidden ? 0 : abs === 0 ? 1 : abs === 1 ? 0.85 : 0.45;
          const z = 50 - abs;
          const blur = abs >= 2 ? "blur(3px)" : "blur(0px)";
          const shouldLoad = loadedIndices.has(i) || abs <= 1;

          return (
            <button
              type="button"
              key={img.id + "-" + i}
              onClick={() => setIndex(i)}
              aria-hidden={hidden}
              tabIndex={hidden ? -1 : 0}
              className="absolute top-1/2 start-1/2 -mt-[175px] md:-mt-[230px] -ms-[140px] md:-ms-[184px] w-[280px] md:w-[368px] h-[350px] md:h-[460px] rounded-3xl overflow-hidden border border-border bg-card shadow-2xl transition-all duration-500 cursor-pointer will-change-transform"
              style={{
                transform: `translate3d(${translateX}%, 0, 0) scale(${scale}) rotateY(${rotateY}deg)`,
                opacity,
                zIndex: z,
                filter: blur,
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: hidden ? "none" : "auto",
              }}
            >
              {shouldLoad ? (
                <TestimonialImage src={img.image_url} priority={abs === 0} />
              ) : (
                <div className="w-full h-full bg-card/60 animate-pulse grid place-items-center">
                  <div className="size-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                </div>
              )}
              {abs === 0 && (
                <div className="absolute inset-0 ring-2 ring-brand/60 rounded-3xl pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="relative mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => go(-1)}
          aria-label="Previous"
          className="w-11 h-11 rounded-full border border-border bg-card hover:bg-brand hover:text-brand-foreground hover:border-brand transition-all"
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === index ? "w-8 bg-brand" : "w-1.5 bg-border hover:bg-muted-foreground"
                }`}
            />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          aria-label="Next"
          className="w-11 h-11 rounded-full border border-border bg-card hover:bg-brand hover:text-brand-foreground hover:border-brand transition-all"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function TestimonialImage({ src, priority }: { src: string; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full h-full bg-card overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 bg-muted/40 animate-pulse grid place-items-center z-10">
          <div className="size-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"
          }`}
      />
    </div>
  );
}
