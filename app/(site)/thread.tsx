"use client";

import { useEffect, useRef } from "react";
import { DEMO_STEPS, DEMO_THREAD, type DemoMessage } from "@/src/web/demo-thread";

/**
 * The product demo *is* the page: a real bet plays out in an iMessage
 * thread as you scroll. Progressive enhancement — without JS (or with
 * reduced motion) every bubble is simply visible.
 */
export function ScrollThread() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("lenis"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      const tickerFn = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tickerFn);
      gsap.ticker.lagSmoothing(0);

      // The first two beats (the ask and the card) are visible on load so the
      // first viewport shows the product; scrolling plays the rest.
      const VISIBLE_AT_LOAD = 2;
      const all = Array.from(el.querySelectorAll<HTMLElement>("[data-step]"));
      const bubbles = all.filter((b) => Number(b.dataset.step) >= VISIBLE_AT_LOAD);
      const stamps = Array.from(el.querySelectorAll<HTMLElement>("[data-stamp]"));
      gsap.set(bubbles, { autoAlpha: 0, y: 24, scale: 0.96, transformOrigin: "bottom left" });
      gsap.set(stamps, { autoAlpha: 0, scale: 1.6, rotate: -12 });

      const stage = el.closest<HTMLElement>("[data-thread-stage]") ?? el;
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: "top 24px",
          end: () => `+=${(DEMO_STEPS - VISIBLE_AT_LOAD) * 380}`,
          scrub: 0.6,
          pin: stage,
          pinSpacing: true,
          anticipatePin: 1,
        },
      });

      for (let step = VISIBLE_AT_LOAD; step < DEMO_STEPS; step++) {
        const group = bubbles.filter((b) => Number(b.dataset.step) === step);
        const at = step - VISIBLE_AT_LOAD;
        tl.to(group, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out", stagger: 0.08 }, at);
        const stamp = stamps.filter((s) => Number(s.dataset.step) === step);
        if (stamp.length) tl.to(stamp, { autoAlpha: 1, scale: 1, rotate: -4, duration: 0.35, ease: "back.out(2.5)" }, at + 0.45);
        // Keep the newest message in view as the thread grows.
        tl.to(el, { scrollTop: () => el.scrollHeight, duration: 0.4, ease: "none" }, at + 0.1);
      }

      cleanup = () => {
        tl.scrollTrigger?.kill();
        tl.kill();
        gsap.ticker.remove(tickerFn);
        lenis.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={root} className="no-scrollbar h-[560px] overflow-y-auto overscroll-contain px-4 pb-6 pt-8 sm:h-[620px]" aria-label="Example conversation with the bot">
      <ol className="flex flex-col gap-2.5">
        {DEMO_THREAD.map((m, i) => (
          <Bubble key={i} m={m} />
        ))}
      </ol>
    </div>
  );
}

function Bubble({ m }: { m: DemoMessage }) {
  if (m.kind === "reaction") {
    return (
      <li data-step={m.step} className="flex justify-end pr-4 text-xs text-ink-soft">
        <span><span className="mr-1 text-base">{m.emoji}</span>{m.from} reacted to the card</span>
      </li>
    );
  }
  if (m.kind === "photo") {
    return (
      <li data-step={m.step} className="flex justify-end">
        <figure className="max-w-[72%]">
          <div className="aspect-[3/4] w-40 overflow-hidden rounded-2xl bg-ink">
            <div className="flex h-full flex-col justify-between p-3 text-[10px] text-paper/80">
              <span className="num">● REC</span>
              <span className="self-center rounded bg-paper/90 px-2 py-0.5 font-mono text-ink">walrus-42</span>
              <span className="num">{m.caption}</span>
            </div>
          </div>
          <figcaption className="mt-1 text-right text-[11px] text-ink-soft">{m.from}</figcaption>
        </figure>
      </li>
    );
  }
  const isBot = m.kind === "out";
  return (
    <li data-step={m.step} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div className={`relative max-w-[82%] whitespace-pre-line rounded-[18px] px-3.5 py-2 text-[15px] leading-snug ${isBot ? "bg-gray-bubble text-ink" : "bg-bubble text-white"}`}>
        {!isBot && <span className="mb-0.5 block text-[11px] opacity-70">{m.from}</span>}
        {m.text}
        {m.kind === "out" && m.stamp && (
          <span
            data-stamp
            data-step={m.step}
            className={`stamp absolute -right-3 -top-3 bg-paper ${m.stamp === "locked" ? "text-locked" : "text-stamp"}`}
          >
            {m.stamp}
          </span>
        )}
      </div>
    </li>
  );
}
