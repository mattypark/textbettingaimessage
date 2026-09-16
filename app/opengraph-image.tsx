import { ImageResponse } from "next/og";

export const alt = "Bookie — bets in your group chat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f1ea", color: "#141414", fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28 }}>
          <span>Bookie</span>
          <span style={{ border: "3px solid #c8322b", color: "#c8322b", padding: "6px 14px", borderRadius: 6, fontSize: 20, letterSpacing: 3, transform: "rotate(-4deg)", fontFamily: "monospace" }}>POINTS, NOT MONEY</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, lineHeight: 0.95, maxWidth: 900 }}>Bets between friends, settled.</div>
          <div style={{ fontSize: 30, color: "#4a4740", fontFamily: "sans-serif" }}>Add one number to your group chat. Say the bet. 👍 to lock. Proof in the thread.</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "sans-serif", fontSize: 24 }}>
          <span style={{ background: "#1a8cff", color: "#fff", padding: "12px 20px", borderRadius: 22 }}>bookie 20 says I make this shot by friday</span>
          <span style={{ background: "#e5e2da", padding: "12px 20px", borderRadius: 22 }}>🔒 LOCKED — 20 pts each held.</span>
        </div>
      </div>
    ),
    size
  );
}
