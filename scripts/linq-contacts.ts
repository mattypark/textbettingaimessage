/**
 * Register numbers on the free-tier shared line so their texts reach the
 * webhook. With no arguments it syncs everyone the bot already knows from
 * the database; otherwise it adds the numbers you name.
 *
 *   npm run linq:contacts                    # everyone in the database
 *   npm run linq:contacts -- +17135550100    # specific numbers
 *
 * Needs LINQ_ORG_ID and LINQ_API_KEY. A dedicated line needs none of this.
 */
import { supabaseAdmin } from "@/src/db/admin";
import { addSharedLineContact, sharedLineEnabled } from "@/src/transport/linq/contacts";

async function main() {
  if (!sharedLineEnabled()) throw new Error("set LINQ_ORG_ID (and LINQ_API_KEY) in .env.local first");
  const named = process.argv.slice(2).filter((a) => a.startsWith("+"));

  let phones = named;
  if (!phones.length) {
    const { data, error } = await supabaseAdmin().from("users").select("phone");
    if (error) throw new Error(error.message);
    phones = (data ?? []).map((u) => String(u.phone));
  }
  if (!phones.length) return console.info("nobody to add yet");

  let added = 0;
  for (const phone of phones) {
    const result = await addSharedLineContact(phone);
    console.info(`…${phone.slice(-4)}: ${result.ok ? "on the line" : result.error}`);
    if (result.ok) added += 1;
  }
  console.info(`\n${added}/${phones.length} registered. They still have to text the line once before it can start a thread with them.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
