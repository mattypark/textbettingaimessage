import { NextResponse } from "next/server";
import { isTransportEnabled, pipelineFor } from "@/src/inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Linq webhook. The body is read raw so the Standard-Webhooks signature can
 * be checked before anything is parsed. Handler failures return 200 — the
 * inbox row already holds the message and the cron tick retries it.
 */
export async function POST(request: Request) {
  if (!isTransportEnabled("linq")) {
    return NextResponse.json({ error: "linq transport disabled" }, { status: 503 });
  }
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  const result = await pipelineFor("linq").handle(rawBody, headers);

  if (result.outcome === "unauthorized") return NextResponse.json({ error: "bad signature" }, { status: 401 });
  return NextResponse.json(result);
}
