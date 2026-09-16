import { NextResponse } from "next/server";
import { verifyStandardWebhook } from "@/src/auth/hook-signature";
import { env } from "@/src/config/env";
import { createTransport } from "@/src/transport";

export const runtime = "nodejs";

/**
 * Supabase Auth "Send SMS" hook. Instead of Twilio, the bot's own line
 * delivers the one-time code as an iMessage — the person already knows the
 * number. Configure in Supabase → Auth → Hooks with SUPABASE_AUTH_HOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  if (!secret || !verifyStandardWebhook(rawBody, headers, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const phone = payload.user?.phone?.startsWith("+") ? payload.user.phone : payload.user?.phone ? `+${payload.user.phone}` : undefined;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return NextResponse.json({ error: "missing phone or otp" }, { status: 400 });

  const transport = createTransport(env().TRANSPORT);
  await transport.send(phone, { text: `${otp} is your ${env().BOT_NAMES.split(",")[0]} sign-in code. It expires in 10 minutes.`, idempotencyKey: `otp:${headers["webhook-id"] ?? otp}` });
  return NextResponse.json({});
}
