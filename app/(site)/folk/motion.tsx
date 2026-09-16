"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

/** Fade-and-rise once when the element scrolls into view. `delay` staggers siblings. */
export function Reveal({ children, delay = 0, y = 18, className = "", amount = 0.2 }: { children: ReactNode; delay?: number; y?: number; className?: string; amount?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Landing-only: Lenis smooth wheel scrolling plus a GSAP ScrollTrigger
 * parallax on every `[data-parallax]` element inside `[data-hero]`. Both
 * skip entirely under prefers-reduced-motion. Touch keeps native scroll.
 */
export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const [{ default: Lenis }, { default: gsap }, { ScrollTrigger }] = await Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({ autoRaf: true, lerp: 0.12, wheelMultiplier: 0.95 });
      lenis.on("scroll", ScrollTrigger.update);

      const onAnchor = (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"], a[href^="/#"]');
        if (!a) return;
        const id = a.getAttribute("href")!.replace(/^\/?#/, "");
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -24 });
      };
      document.addEventListener("click", onAnchor);

      const hero = document.querySelector<HTMLElement>("[data-hero]");
      const tweens = hero
        ? [...hero.querySelectorAll<HTMLElement>("[data-parallax]")].map((el) => {
            const speed = Number(el.dataset.parallax ?? "0.3");
            // Tween a custom property: the element's transform belongs to the pop/bob keyframes.
            return gsap.fromTo(el, { "--py": "0px" }, {
              "--py": `${Math.round(-160 * speed)}px`,
              ease: "none",
              scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 },
            });
          })
        : [];

      cleanup = () => {
        document.removeEventListener("click", onAnchor);
        tweens.forEach((t) => {
          t.scrollTrigger?.kill();
          t.kill();
        });
        lenis.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  return null;
}
