/**
 * Mint an invite code (idempotent) and, optionally, redeem it for every
 * user row that already exists — the founder's own number after the first
 * "hey mushy". Phones are never printed.
 *   npm run seed:invite -- MATT0001 50
 *   npm run seed:invite -- MATT0001 50 --activate-existing
 */
import { supabaseAdmin } from "@/src/db/admin";

async function main() {
  const [code = "MATT0001", maxUsesArg = "50", flag] = process.argv.slice(2);
  const maxUses = Number(maxUsesArg);
  const db = supabaseAdmin();

  const { error: mintError } = await db.from("invites").upsert({ code: code.toUpperCase(), max_uses: maxUses }, { onConflict: "code" });
  if (mintError) throw new Error(`mint: ${mintError.message}`);
  console.log(`invite ${code.toUpperCase()} ready (${maxUses} uses)`);

  if (flag === "--activate-existing") {
    const { data: users, error } = await db.from("users").select("id, phone, access");
    if (error) throw new Error(error.message);
    for (const u of users ?? []) {
      if (u.access === "active") continue;
      const { error: redeemError } = await db.rpc("redeem_invite", { p_code: code.toUpperCase(), p_phone: u.phone });
      console.log(`…${String(u.phone).slice(-4)}: ${redeemError ? `failed — ${redeemError.message}` : "active"}`);
    }
  }
  const { data: invites } = await db.from("invites").select("code, max_uses, uses");
  console.log("invites:", (invites ?? []).map((i) => `${i.code} ${i.uses}/${i.max_uses}`).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
