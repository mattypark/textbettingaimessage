/**
 * What did the last few inbound messages do? Reads the inbox and outbox
 * with the service role (never the browser) so a live check can be
 * verified from the terminal instead of guessing from the phone.
 *   npm run inbox:tail            # last 15
 *   npm run inbox:tail -- 40      # last 40
 */
import { supabaseAdmin } from "@/src/db/admin";

async function main() {
  const limit = Number(process.argv[2] ?? 15);
  const db = supabaseAdmin();
  const { data: inbox, error } = await db
    .from("provider_messages")
    .select("received_at, direction, status, last_error, sender_handle, chat_id, normalized")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  console.log(`--- inbox (newest first, ${inbox?.length ?? 0}) ---`);
  for (const row of inbox ?? []) {
    const n = (row.normalized ?? {}) as { text?: string; reaction?: { kind?: string }; attachments?: unknown[]; isGroup?: boolean; participantAdded?: string };
    const what = n.reaction ? `reaction:${n.reaction.kind}` : n.participantAdded ? `participant+${n.participantAdded.slice(-4)}` : n.attachments?.length ? `media×${n.attachments.length}` : JSON.stringify(n.text ?? "").slice(0, 60);
    console.log(`${String(row.received_at).slice(11, 19)} ${n.isGroup === false ? "dm   " : "group"} …${String(row.sender_handle ?? "").slice(-4)} ${String(row.status).padEnd(10)} ${row.last_error ?? ""} ${what}`);
  }
  const { data: outbox } = await db.from("outbound_messages").select("created_at, status, last_error, body").order("created_at", { ascending: false }).limit(limit);
  console.log(`--- outbox (newest first, ${outbox?.length ?? 0}) ---`);
  for (const row of outbox ?? []) {
    const body = row.body as { text?: string };
    console.log(`${String(row.created_at).slice(11, 19)} ${String(row.status).padEnd(7)} ${row.last_error ?? ""} ${JSON.stringify(body.text ?? "").slice(0, 90)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
