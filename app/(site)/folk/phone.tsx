"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./mascot";

export interface PhoneMessage {
  side: "in" | "out";
  text: string;
  bold?: boolean;
}

export const HERO_THREAD: PhoneMessage[] = [
  { side: "out", text: "mushy 20 says I make a half-court shot by friday. jake u in?" },
  { side: "in", text: "🎯 BET #a41f0c\nMatt: \"I make a half-court shot\"\n20 pts each · due Fri 11:59 PM\nproof: video, ball leaves your hands from half court and goes in\n👍 this to lock" },
  { side: "out", text: "no shot lol 👍" },
  { side: "in", text: "🔒 LOCKED. 20 pts each held. show the word \"walrus-42\" in the video." },
  { side: "in", text: "⚖️ VERDICT: claim stands (94%). Matt wins. 24h to dispute.", bold: true },
];

const OUT_GAP = 550;
const TYPING = 700;

/**
 * iPhone mockup whose thread plays out once it scrolls into view: outgoing
 * bubbles spring in, incoming ones wait behind typing dots first. Reduced
 * motion shows the whole thread at once.
 */
export function Phone({ messages = HERO_THREAD, name = "Mushy", className = "" }: { messages?: PhoneMessage[]; name?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const animate = !reduce;
  const visible = reduce ? messages.length : shown;

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        let i = 0;
        const step = () => {
          if (i >= messages.length) return;
          const next = messages[i];
          if (next.side === "in") {
            setTyping(true);
            timer = setTimeout(() => {
              setTyping(false);
              i += 1;
              setShown(i);
              timer = setTimeout(step, OUT_GAP);
            }, TYPING);
          } else {
            i += 1;
            setShown(i);
            timer = setTimeout(step, OUT_GAP);
          }
        };
        timer = setTimeout(step, 250);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [messages, reduce]);

  return (
    <div ref={ref} className={`phone-shell w-[300px] sm:w-[340px] ${className}`} aria-label="iMessage conversation with the bot">
      <div className="phone-screen relative overflow-hidden">
        <div className="mx-auto mt-3 h-7 w-28 rounded-full bg-[#101114]" />
        <div className="flex items-center justify-between px-5 pt-3">
          <span className="flex h-8 items-center gap-1 rounded-full bg-[#eef0f3] px-3 text-sm text-[#1a8cff]">
            ‹ <span className="rounded-full bg-[#1f2a2f] px-1.5 text-[10px] text-white">2</span>
          </span>
          <div className="flex flex-col items-center">
            <Avatar size={44} />
            <span className="mt-1 text-[11px] text-[#1f2a2f]">{name} ›</span>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f3] text-[#1a8cff]">▭</span>
        </div>
        <ol className="flex min-h-[380px] flex-col gap-2 px-3 pb-6 pt-6" aria-live="polite">
          {messages.slice(0, visible).map((m, i) => (
            <li key={i} className={`flex ${m.side === "out" ? "justify-end" : "justify-start"}`}>
              <span
                className={`max-w-[82%] whitespace-pre-line rounded-[18px] px-3.5 py-2 text-[14px] leading-snug ${animate ? "bubble-in" : ""} ${m.side === "out" ? "bg-[#1a8cff] text-white" : "bg-[#e9e9eb] text-[#1f2a2f]"} ${m.bold ? "font-semibold" : ""}`}
                style={{ "--origin": m.side === "out" ? "right bottom" : "left bottom" } as React.CSSProperties}
              >
                {m.text}
              </span>
            </li>
          ))}
          {typing && (
            <li className="flex justify-start" aria-label={`${name} is typing`}>
              <span className="bubble-in flex items-center gap-1 rounded-[18px] bg-[#e9e9eb] px-3.5 py-3">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="typing-dot h-2 w-2 rounded-full bg-[#6b7079]" style={{ "--delay": `${d * 0.15}s` } as React.CSSProperties} />
                ))}
              </span>
            </li>
          )}
        </ol>
        <div className="mx-3 mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f3] text-lg text-[#6b7079]">+</span>
          <span className="flex h-8 flex-1 items-center rounded-full border border-[#dfe2e6] px-3 text-[13px] text-[#6b7079]">iMessage</span>
        </div>
      </div>
    </div>
  );
}
