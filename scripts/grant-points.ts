/**
 * Grant points to a user by phone. Dev/ops helper.
 *   npx tsx scripts/grant-points.ts +15551234567 100 "welcome"
 */
import { supabaseAdmin } from "@/src/db/admin";
import { createLedger } from "@/src/ledger";

const [phone, amountArg, memo = "manual grant"] = process.argv.slice(2);
if (!phone || !amountArg) {
  console.error("usage: grant-points <phone E.164> <amount> [memo]");
  process.exit(1);
}

const { data: user, error } = await supabaseAdmin()
  .from("users")
  .upsert({ phone }, { onConflict: "phone" })
  .select("id")
  .single();
if (error || !user) throw new Error(`user upsert failed: ${error?.message}`);

await createLedger().grant({ userId: user.id, amount: BigInt(amountArg), idem: `manual:${phone}:${Date.now()}`, memo });
console.log(`granted ${amountArg} PTS to ${phone}`);
