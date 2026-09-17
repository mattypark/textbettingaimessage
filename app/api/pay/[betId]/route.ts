import { NextResponse } from "next/server";
import { loadPayPage, markPaidFromWeb } from "@/src/settle/pay-page";

/** JSON twin of the pay sheet, for the web app or a future iMessage extension. */
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ betId: string }> }) {
  const { betId } = await params;
  const page = await loadPayPage(betId);
  return page ? NextResponse.json(page) : NextResponse.json({ error: "no such bet" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ betId: string }> }) {
  const { betId } = await params;
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const ok = await markPaidFromWeb(betId, body.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not a payer on a funded bet" }, { status: 400 });
}
