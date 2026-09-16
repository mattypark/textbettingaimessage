/** The landing page's scripted thread — a real bet, start to finish. */
export type DemoMessage =
  | { kind: "in"; from: string; text: string; step: number }
  | { kind: "out"; text: string; step: number; stamp?: "locked" | "verdict" | "settled" }
  | { kind: "reaction"; from: string; emoji: string; step: number }
  | { kind: "photo"; from: string; caption: string; step: number };

export const DEMO_THREAD: DemoMessage[] = [
  { kind: "in", from: "Matt", text: "bookie 20 says I make a half-court shot by friday. jake you in?", step: 0 },
  {
    kind: "out",
    step: 1,
    text: "🎯 BET #a41f0c\nMatt: \"I make a half-court shot\"\nStake: 20 pts each\nFor: Matt · Against: Jake\nDeadline: Fri, Sep 18, 11:59 PM\nProof: video, ball leaves your hands from half court and goes in\nJudge: the bot\n👍 this to lock",
  },
  { kind: "reaction", from: "Jake", emoji: "👍", step: 2 },
  { kind: "out", step: 3, stamp: "locked", text: "🔒 LOCKED #a41f0c — 20 pts each held.\nProof due Fri 11:59 PM (+12h grace).\nShow the word \"walrus-42\" in your proof." },
  { kind: "in", from: "Jake", text: "no shot lol", step: 4 },
  { kind: "photo", from: "Matt", caption: "IMG_4471.MOV · 0:07", step: 5 },
  { kind: "out", step: 6, text: "📸 Proof received for #a41f0c. Judging…" },
  {
    kind: "out",
    step: 7,
    stamp: "verdict",
    text: "⚖️ VERDICT #a41f0c: claim stands (94% sure). Matt wins.\n✅ ball leaves hands at half court\n✅ ball goes through the hoop\n✅ \"walrus-42\" on the whiteboard\n24h to dispute — reply \"dispute #a41f0c\" (bond: 10 pts).",
  },
  { kind: "in", from: "Jake", text: "…fine", step: 8 },
  { kind: "out", step: 9, stamp: "settled", text: "💸 SETTLED #a41f0c: Matt +40 pts. GG." },
];

export const DEMO_STEPS = Math.max(...DEMO_THREAD.map((m) => m.step)) + 1;
