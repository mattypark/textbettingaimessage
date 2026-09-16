import { ImageResponse } from "next/og";

export const alt = "Bookie — bets in your group chat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1f2a2f";

/** Sky hero in a card: headline, two iMessage bubbles, the points-not-money pill. Plain shapes only (Satori). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(180deg, #0399bd 0%, #26beff 40%, #6fd2ff 70%, #b4e5ff 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 40, fontWeight: 800 }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 30, height: 34, borderRadius: 15, background: "#fffdf7", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 4 }}>
                <div style={{ width: 22, height: 6, background: "#141414", borderRadius: 3 }} />
                <div style={{ width: 14, height: 3, background: "#141414", borderRadius: 2 }} />
              </div>
            </div>
            Bookie
          </div>
          <div style={{ background: "rgba(255,255,255,0.9)", color: INK, padding: "10px 22px", borderRadius: 999, fontSize: 22, fontWeight: 700 }}>points, not money</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1, fontWeight: 800, letterSpacing: -3, maxWidth: 980, textShadow: "0 8px 30px rgba(0,60,120,0.25)" }}>the bookie that actually settles the bet.</div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.85)" }}>add one number to the group chat. say the bet. 👍 to lock. proof in the thread.</div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 24 }}>
          <div style={{ background: "#1a8cff", color: "#fff", padding: "14px 22px", borderRadius: 22, boxShadow: "0 12px 30px rgba(20,40,80,0.2)" }}>bookie 20 says I make this shot by friday</div>
          <div style={{ background: "#fff", color: INK, padding: "14px 22px", borderRadius: 22, boxShadow: "0 12px 30px rgba(20,40,80,0.2)" }}>🔒 locked. 20 pts each held.</div>
        </div>
      </div>
    ),
    size,
  );
}
