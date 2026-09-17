import { ImageResponse } from "next/og";

/** The card iMessage shows for /sign/<chat>. */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#ffffff", color: "#111111", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, color: "#8e8e93" }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: "#111111", display: "flex" }} />
          <span>mushy</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>everyone signs once</div>
          <div style={{ fontSize: 44, color: "#3a3a3c" }}>name, number, terms, privacy — 30 seconds</div>
        </div>
        <div style={{ fontSize: 34, color: "#8e8e93" }}>tap to sign</div>
      </div>
    ),
    size,
  );
}
