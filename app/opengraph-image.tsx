import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Bookie — bets in your group chat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1f2a2f";

/** Sky hero in a card: the mark, headline, two iMessage bubbles, the points-not-money pill. */
export default async function OpenGraphImage() {
  const mark = await readFile(path.join(process.cwd(), "public/brand/bookie-mark-white-512.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

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
            <div style={{ width: 60, height: 60, borderRadius: 30, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={markSrc} width={46} height={46} alt="" />
            </div>
            Bookie
          </div>
          <div style={{ background: "rgba(255,255,255,0.9)", color: INK, padding: "10px 22px", borderRadius: 999, fontSize: 22, fontWeight: 700 }}>points, not money</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
            <div style={{ fontSize: 88, lineHeight: 1, fontWeight: 800, letterSpacing: -3, textShadow: "0 8px 30px rgba(0,60,120,0.25)" }}>the bookie that actually settles the bet.</div>
            <div style={{ fontSize: 27, color: "rgba(255,255,255,0.88)" }}>add one number to the group chat. say the bet. 👍 to lock. proof in the thread.</div>
          </div>
          <img src={markSrc} width={220} height={220} alt="" style={{ transform: "rotate(-6deg)" }} />
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
