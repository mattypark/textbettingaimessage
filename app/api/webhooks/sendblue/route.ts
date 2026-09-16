import { NextResponse } from "next/server";
import { isTransportEnabled, pipelineFor } from "@/src/inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sendblue webhook. Same contract as the Linq route; verification is the shared-secret header. */
export async function POST(request: Request) {
  if (!isTransportEnabled("sendblue")) {
    return NextResponse.json({ error: "sendblue transport disabled" }, { status: 503 });
  }
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  const result = await pipelineFor("sendblue").handle(rawBody, headers);

  if (result.outcome === "unauthorized") return NextResponse.json({ error: "bad signature" }, { status: 401 });
  return NextResponse.json(result);
}
