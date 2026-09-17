import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/src/access/rate-limit";
import { AccessError } from "@/src/access/store";
import { defaultAccessStore, defaultRateLimiter } from "@/src/inbound";

const Body = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "use your full number with country code"),
  ref: z.string().trim().max(16).optional(),
});

/** Five attempts an hour from one address and five for one phone; enough for typos, not for a script. */
const JOIN_LIMIT = 5;
const JOIN_WINDOW_SECS = 60 * 60;

function tooMany(retryAfterSecs: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSecs / 60));
  return NextResponse.json(
    { error: `slow down — try again in ${minutes} minute${minutes === 1 ? "" : "s"}` },
    { status: 429, headers: { "retry-after": String(retryAfterSecs) } },
  );
}

/**
 * The join flow. With a valid invite code the phone is activated on the
 * spot and gets its own code; otherwise it lands on the waitlist and gets
 * a referral link. Same endpoint either way so the UI stays one form.
 */
export async function POST(request: Request) {
  const limiter = defaultRateLimiter();
  const byIp = await limiter.hit(`join:ip:${clientIp(request.headers)}`, JOIN_LIMIT, JOIN_WINDOW_SECS);
  if (!byIp.allowed) return tooMany(byIp.retryAfterSecs);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad input" }, { status: 400 });
  const { phone, ref } = parsed.data;

  const byPhone = await limiter.hit(`join:phone:${phone}`, JOIN_LIMIT, JOIN_WINDOW_SECS);
  if (!byPhone.allowed) return tooMany(byPhone.retryAfterSecs);

  const access = defaultAccessStore();

  if (ref) {
    try {
      const ownCode = await access.redeemInvite(ref, phone);
      return NextResponse.json({ status: "active", ownCode });
    } catch (error) {
      if (!(error instanceof AccessError) || error.code === "unknown") throw error;
      // Not a live invite — maybe a waitlist referral link. Fall through.
    }
  }

  const result = await access.joinWaitlist(phone, ref);
  return NextResponse.json({ status: result.activated ? "active" : "waitlist", referralCode: result.referralCode, rank: result.rank });
}
