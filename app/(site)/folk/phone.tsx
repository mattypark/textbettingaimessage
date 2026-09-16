import { Avatar } from "./mascot";

export interface PhoneMessage {
  side: "in" | "out";
  text: string;
  bold?: boolean;
}

export const HERO_THREAD: PhoneMessage[] = [
  { side: "out", text: "bookie 20 says I make a half-court shot by friday. jake u in?" },
  { side: "in", text: "🎯 BET #a41f0c\nMatt: \"I make a half-court shot\"\n20 pts each · due Fri 11:59 PM\nproof: video, ball leaves your hands from half court and goes in\n👍 this to lock" },
  { side: "out", text: "no shot lol 👍" },
  { side: "in", text: "🔒 LOCKED. 20 pts each held. show the word \"walrus-42\" in the video." },
  { side: "in", text: "⚖️ VERDICT: claim stands (94%). Matt wins. 24h to dispute.", bold: true },
];

/** iPhone mockup with a live-looking thread. Pure CSS, no device image. */
export function Phone({ messages = HERO_THREAD, name = "Bookie", className = "" }: { messages?: PhoneMessage[]; name?: string; className?: string }) {
  return (
    <div className={`phone-shell w-[300px] sm:w-[340px] ${className}`} aria-label="iMessage conversation with the bot">
      <div className="phone-screen relative overflow-hidden">
        <div className="mx-auto mt-3 h-7 w-28 rounded-full bg-[#101114]" />
        <div className="flex items-center justify-between px-5 pt-3">
          <span className="flex h-8 items-center gap-1 rounded-full bg-[#eef0f3] px-3 text-sm text-[#1a8cff]">‹ <span className="rounded-full bg-[#1f2a2f] px-1.5 text-[10px] text-white">2</span></span>
          <div className="flex flex-col items-center">
            <Avatar size={44} />
            <span className="mt-1 text-[11px] text-[#1f2a2f]">{name} ›</span>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f3] text-[#1a8cff]">▭</span>
        </div>
        <ol className="flex min-h-[380px] flex-col gap-2 px-3 pb-6 pt-6">
          {messages.map((m, i) => (
            <li key={i} className={`flex ${m.side === "out" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[82%] whitespace-pre-line rounded-[18px] px-3.5 py-2 text-[14px] leading-snug ${m.side === "out" ? "bg-[#1a8cff] text-white" : "bg-[#e9e9eb] text-[#1f2a2f]"} ${m.bold ? "font-semibold" : ""}`}>
                {m.text}
              </span>
            </li>
          ))}
        </ol>
        <div className="mx-3 mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f3] text-lg text-[#8a8f96]">+</span>
          <span className="flex h-8 flex-1 items-center rounded-full border border-[#dfe2e6] px-3 text-[13px] text-[#8a8f96]">iMessage</span>
        </div>
      </div>
    </div>
  );
}
