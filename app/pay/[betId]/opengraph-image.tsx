import { ImageResponse } from "next/og";
import { loadPayPage } from "@/src/settle/pay-page";

/** The card image iMessage shows for /pay/<bet>: the amount, the claim, who's holding. */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ betId: string }> }) {
  const { betId } = await params;
  const page = await loadPayPage(betId);
  const amount = page?.amountLabel ?? "mushy";
  const claim = page?.claim ?? "keeps score on bets";
  const who = page ? (page.phase === "collect" ? `put it down · ${page.payeeName} is holding` : page.phase === "payout" ? `pay ${page.payeeName}` : "settled") : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#ffffff", color: "#111111", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, color: "#8e8e93" }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: "#111111", display: "flex" }} />
          <span>mushy</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 168, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{amount}</div>
          <div style={{ fontSize: 44, color: "#3a3a3c" }}>{claim.slice(0, 60)}</div>
        </div>
        <div style={{ fontSize: 34, color: "#8e8e93" }}>{who}</div>
      </div>
    ),
    size,
  );
}
