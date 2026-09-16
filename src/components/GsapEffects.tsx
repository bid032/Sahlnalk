import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin, SplitText);

/**
 * Global GSAP effect layer. Mount once at the app root.
 * Uses MutationObserver so async-loaded elements (React Query results) also get animated.
 * Each element is initialized once via a data-gsap-init flag.
 */
export function GsapEffects() {
  useEffect(() => {
    const splits: SplitText[] = [];
    const cleanups: Array<() => void> = [];

    const init = (el: HTMLElement) => {
      if (el.dataset.gsapInit === "1") return;
      const kind = el.dataset.gsap;
      if (!kind) return;
      el.dataset.gsapInit = "1";

      switch (kind) {
        case "reveal": {
          gsap.from(el, {
            opacity: 0,
            y: 50,
            filter: "blur(12px)",
            duration: 1.1,
            ease: "power3.out",
            immediateRender: false,
            clearProps: "opacity,transform,filter",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          });
          break;
        }
        case "reveal-stagger": {
          const kids = Array.from(el.children) as HTMLElement[];
          if (!kids.length) {
            // children not yet rendered; retry on next observer tick
            el.dataset.gsapInit = "";
            return;
          }
          gsap.from(kids, {
            opacity: 0,
            y: 60,
            scale: 0.92,
            duration: 0.9,
            ease: "power3.out",
            stagger: 0.08,
            immediateRender: false,
            clearProps: "opacity,transform,filter",
            scrollTrigger: { trigger: el, start: "top 95%", once: true },
          });
          requestAnimationFrame(() => ScrollTrigger.refresh());
          break;
        }
        case "card-pop": {
          // Subtle scroll-driven reveal for cards (safe: no big translations / 3D)
          const kids = Array.from(el.children) as HTMLElement[];
          if (!kids.length) { el.dataset.gsapInit = ""; return; }
          kids.forEach((k, i) => {
            gsap.from(k, {
              opacity: 0,
              y: 40,
              scale: 0.94,
              duration: 0.7,
              ease: "power3.out",
              delay: (i % 4) * 0.05,
              immediateRender: false,
              clearProps: "transform,filter,opacity",
              scrollTrigger: {
                trigger: k,
                start: "top 92%",
                once: true,
              },
            });
          });
          requestAnimationFrame(() => ScrollTrigger.refresh());
          break;
        }


        case "scroll-fade": {
          // Element-level fade + slight rise. Do NOT split words -breaking
          // Arabic text into inline-block spans disrupts letter shaping and
          // causes visual overlap on narrow screens.
          gsap.fromTo(
            el,
            { opacity: 0, y: 22, filter: "blur(6px)" },
            {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              duration: 0.9,
              ease: "power3.out",
              immediateRender: false,
              clearProps: "transform,filter",
              scrollTrigger: { trigger: el, start: "top 90%", once: true },
            },
          );
          break;
        }


        case "scroll-scrub": {
          // Continuous scroll-linked animation for whole sections
          gsap.fromTo(
            el,
            { yPercent: 6, opacity: 0.65 },
            {
              yPercent: -4,
              opacity: 1,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
            },
          );
          break;
        }

        case "split-words": {
          const s = new SplitText(el, { type: "words", wordsClass: "inline-block will-change-transform" });
          splits.push(s);
          gsap.from(s.words, {
            opacity: 0,
            y: 40,
            rotationX: -60,
            filter: "blur(8px)",
            duration: 1.1,
            ease: "power3.out",
            stagger: 0.055,
            immediateRender: false,
            clearProps: "opacity,transform,filter",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          });
          break;
        }
        case "split-chars": {
          const s = new SplitText(el, { type: "chars,words", charsClass: "inline-block" });
          splits.push(s);
          gsap.from(s.chars, {
            opacity: 0,
            y: 20,
            duration: 0.5,
            ease: "power2.out",
            stagger: 0.02,
            immediateRender: false,
            clearProps: "opacity,transform",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          });
          break;
        }
        case "scramble": {
          const finalText = el.textContent ?? "";
          gsap.to(el, {
            duration: 1.4,
            scrambleText: { text: finalText, chars: "01!<>-_/[]{}-=+*^?#________", speed: 0.6 },
            ease: "none",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
          break;
        }
        case "parallax": {
          const speed = Number(el.dataset.speed ?? "0.3");
          gsap.to(el, {
            yPercent: -30 * speed,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
          });
          break;
        }
        case "scrub-scale": {
          gsap.fromTo(
            el,
            { scale: 0.85, opacity: 0.6 },
            {
              scale: 1,
              opacity: 1,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top 90%", end: "top 40%", scrub: true },
            },
          );
          break;
        }
        case "magnetic": {
          const strength = Number(el.dataset.strength ?? "0.4");
          const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            xTo((e.clientX - (r.left + r.width / 2)) * strength);
            yTo((e.clientY - (r.top + r.height / 2)) * strength);
          };
          const leave = () => { xTo(0); yTo(0); };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          });
          break;
        }
        case "tilt": {
          el.style.transformStyle = "preserve-3d";
          (el.style as any).transformPerspective = "1000px";
          const rxTo = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power2.out" });
          const ryTo = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power2.out" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            ryTo(px * 14);
            rxTo(-py * 14);
          };
          const leave = () => { rxTo(0); ryTo(0); };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          });
          break;
        }
        case "marquee": {
          const track = el.firstElementChild as HTMLElement | null;
          if (!track) { el.dataset.gsapInit = ""; return; }
          const dur = Number(el.dataset.duration ?? "30");
          const tween = gsap.to(track, { xPercent: -50, duration: dur, ease: "none", repeat: -1 });
          const enter = () => tween.timeScale(0.15);
          const leave = () => tween.timeScale(1);
          el.addEventListener("pointerenter", enter);
          el.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            tween.kill();
            el.removeEventListener("pointerenter", enter);
            el.removeEventListener("pointerleave", leave);
          });
          break;
        }
      }
    };

    const scan = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLElement>("[data-gsap]").forEach(init);
    };

    // Initial scan (delayed once to let first paint settle)
    const idle = (cb: () => void) => {
      const w = window as any;
      if (typeof w.requestIdleCallback === "function") return w.requestIdleCallback(cb, { timeout: 800 });
      return window.setTimeout(cb, 200);
    };
    const first = idle(() => {
      scan();
      ScrollTrigger.refresh();
    });

    // Observe DOM for async-rendered elements -but batch work with rAF so
    // rapid React rerenders don't cause main-thread jank on load.
    let pending: HTMLElement[] = [];
    let rafId = 0;
    const flush = () => {
      rafId = 0;
      const batch = pending;
      pending = [];
      batch.forEach(init);
      if (batch.length) ScrollTrigger.refresh();
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as HTMLElement;
          if (el.hasAttribute?.("data-gsap")) pending.push(el);
          el.querySelectorAll?.<HTMLElement>("[data-gsap]").forEach((c) => pending.push(c));
        });
      }
      if (pending.length && !rafId) rafId = requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);

    // ─── Global scroll progress bar (constant scroll feedback) ───
    const bar = document.createElement("div");
    bar.setAttribute("aria-hidden", "true");
    bar.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "height:2px",
      "width:0%",
      "background:linear-gradient(90deg, var(--brand), var(--brand-glow), var(--brand-deep))",
      "box-shadow:0 0 12px color-mix(in oklab, var(--brand) 60%, transparent)",
      "z-index:9999",
      "pointer-events:none",
      "transition:width 0.05s linear",
    ].join(";");
    document.body.appendChild(bar);
    const progressTween = gsap.to(bar, {
      width: "100%",
      ease: "none",
      scrollTrigger: { start: 0, end: () => document.documentElement.scrollHeight - window.innerHeight, scrub: 0.2 },
    });

    // Safety net: if any [data-gsap] element remains invisible after a while
    // force it back to a visible state. Run less often to save CPU.
    const safety = window.setInterval(() => {
      document.querySelectorAll<HTMLElement>("[data-gsap]").forEach((el) => {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < 0.05) {
          gsap.set(el, { clearProps: "opacity,transform,filter,translate,rotate,scale" });
          el.style.opacity = "1";
        }
      });
    }, 6000);


    return () => {
      const w = window as any;
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(first); else clearTimeout(first);
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(safety);

      observer.disconnect();
      window.removeEventListener("load", onLoad);
      cleanups.forEach((fn) => fn());
      splits.forEach((s) => s.revert());
      progressTween.kill();
      bar.remove();
      ScrollTrigger.getAll().forEach((s) => s.kill());
      // Clear any leftover inline gsap styles so remounted routes never show
      // stuck-invisible elements.
      document.querySelectorAll<HTMLElement>("[data-gsap]").forEach((el) => {
        gsap.set(el, { clearProps: "all" });
        el.dataset.gsapInit = "";
      });
    };

  }, []);

  return null;
}
