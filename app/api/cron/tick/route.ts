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

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await tick(tickDeps());
  return NextResponse.json(report);
}

/** Vercel Cron calls GET every minute (vercel.json) with the CRON_SECRET bearer. */
export async function GET(request: Request) {
  return run(request);
}

/** pg_cron → pg_net posts (migration 0006), and `npm run tick:dev` locally. */
export async function POST(request: Request) {
  return run(request);
}
