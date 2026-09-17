/**
 * Live smoke test for the agent turn against the real model, no iMessage, no DB.
 *   npm run agent:smoke "20 says I make this half court shot by friday, jake you in?"
 * Needs OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local.
 */
import { createModel } from "@/src/model";
import { runAgentTurn } from "@/src/agent/run-turn";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import { MemoryStore } from "@/src/db/memory-store";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

async function main() {
  const text = process.argv.slice(2).join(" ") || "mushy, 20 says I make a half court shot by friday. jake you in?";
  const model = createModel();
  if (!model) throw new Error("set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local");
  console.log(`--- model: ${model.name} ---`);

  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const chat = await store.upsertChat({ provider: "fake", providerEventId: "s", providerMessageId: "s", providerChatId: "g1", isGroup: true, senderHandle: "+15550001", text: "", attachments: [], receivedAt: new Date().toISOString(), raw: {} });
  const ids: Record<string, string> = {};
  for (const [handle, name] of [["+15550001", "Matt"], ["+15550002", "Jake"], ["+15550003", "Sam"]]) {
    const u = await store.upsertUser(handle);
    ids[name] = u.id;
    await store.setDisplayName(u.id, name);
    await store.upsertMember(chat.id, u.id, handle);
    await store.recordTermsAcceptance(u.id, 1, "imessage");
    await ledger.grant({ userId: u.id, amount: 100n, idem: `g:${handle}` });
  }
  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => Object.entries(ids).find(([, v]) => v === id)?.[0] ?? id });

  const replies = await runAgentTurn(
    {
      event: { provider: "fake", providerEventId: "e1", providerMessageId: "m1", providerChatId: "g1", isGroup: true, senderHandle: "+15550001", text, attachments: [], receivedAt: new Date().toISOString(), raw: {} },
      chatId: chat.id,
      userId: ids.Matt,
      decision: { act: true, reason: "named" },
      firstContact: false,
      attachments: [],
    },
    { store, betStore, engine, ledger, siteUrl: "https://example.test", botName: "mushy", model }
  );

  console.log("--- replies ---");
  for (const r of replies) console.log(r.text, r.idempotencyKey ? `(${r.idempotencyKey})` : "");
  console.log("--- bets ---");
  for (const bet of betStore.bets.values()) console.log(JSON.stringify({ ...bet, stake: { ...bet.stake, amount: bet.stake.amount.toString() } }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
