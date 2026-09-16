"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type KeyboardEvent, type ReactNode } from "react";

type Face = "slip" | "verdict";

/**
 * Slip on the front, verdict on the back. Faces are server-rendered and
 * passed in. With reduced motion the flip becomes a short crossfade.
 */
export function FlipCard({ front, back, hasBack, defaultFace = "slip" }: { front: ReactNode; back: ReactNode; hasBack: boolean; defaultFace?: Face }) {
  const [face, setFace] = useState<Face>(defaultFace);
  const reduce = useReducedMotion();
  const flipped = face === "verdict";

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") setFace("slip");
    if (e.key === "ArrowRight" && hasBack) setFace("verdict");
  }

  const tab = (active: boolean, disabled = false) =>
    `min-h-11 rounded-full px-5 text-[14px] font-semibold transition-colors ${active ? "bg-white text-sky-ink shadow-sm" : "text-sky-ink/70 hover:text-sky-ink"} ${disabled ? "cursor-not-allowed opacity-40 hover:text-sky-ink/70" : ""}`;

  return (
    <div>
      <div role="tablist" aria-label="bet card" onKeyDown={onKey} className="tab-pill inline-flex p-1">
        <button role="tab" aria-selected={!flipped} aria-controls="face-slip" onClick={() => setFace("slip")} className={tab(!flipped)}>
          the bet
        </button>
        <button role="tab" aria-selected={flipped} aria-controls="face-verdict" disabled={!hasBack} onClick={() => hasBack && setFace("verdict")} className={tab(flipped, !hasBack)}>
          verdict
        </button>
      </div>

      {reduce ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={face} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="mt-4">
            {flipped ? back : front}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="flip-scene mt-4">
          <motion.div
            className="grid"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div id="face-slip" role="tabpanel" className="flip-face [grid-area:1/1]" aria-hidden={flipped} inert={flipped}>
              {front}
            </div>
            <div id="face-verdict" role="tabpanel" className="flip-face [grid-area:1/1] [transform:rotateY(180deg)]" aria-hidden={!flipped} inert={!flipped}>
              {back}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
