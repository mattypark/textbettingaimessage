import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/src/config/env";
import { tickDeps } from "@/src/inbound";
import { tick } from "@/src/jobs/tick";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return env().NODE_ENV !== "production";
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called every minute by pg_cron → pg_net (see migration 0006). */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await tick(tickDeps());
  return NextResponse.json(report);
}
