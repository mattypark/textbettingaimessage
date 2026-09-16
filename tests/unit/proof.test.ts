import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { agentHandler } from "@/src/agent/handler";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { tick } from "@/src/jobs/tick";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { escrowAccount } from "@/src/ledger/types";
import { averageHash, hamming } from "@/src/proof/hash";
import { awaitsProof } from "@/src/proof/intake";
import type { Judge } from "@/src/proof/judge";
import { MemoryMediaStore } from "@/src/proof/media-store";
import { runJudgeJob } from "@/src/proof/run-judge";
import { MemoryProofStore } from "@/src/proof/store";
import { sniffMime } from "@/src/transport/attachments";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

const T0 = new Date("2026-09-16T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

async function png(seed: number, w = 64, h = 64): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const v = ((x * seed + y * 7) % 251) as number;
    raw[i * 3] = v;
    raw[i * 3 + 1] = (v * 3) % 255;
    raw[i * 3 + 2] = (v * 5) % 255;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

describe("hash", () => {
  it("average hash is stable across re-encoding and resizing, different across images", async () => {
    const a = await png(3);
    const aJpeg = await sharp(a).jpeg({ quality: 70 }).toBuffer();
    const aSmall = await sharp(a).resize(32, 32).png().toBuffer();
    const b = await png(11);
    const ha = await averageHash(a);
    expect(hamming(ha, await averageHash(aJpeg))).toBeLessThan(10);
    expect(hamming(ha, await averageHash(aSmall))).toBeLessThan(10);
    expect(hamming(ha, await averageHash(b))).toBeGreaterThanOrEqual(12);
  });

  it("sniffMime trusts magic bytes over the provider label", async () => {
    expect(sniffMime(await png(1), "application/octet-stream")).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/heic")).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("garbage"), "video/mp4")).toBe("video/mp4");
  });
});

async function world(judge: Judge) {
  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const proofStore = new MemoryProofStore();
  betStore.jobSink = (kind, payload) => proofStore.enqueue(kind, payload);
  const media = new MemoryMediaStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const now = { value: T0 };
  const users: Record<string, string> = {};
  for (const h of ["+1matt", "+1jake"]) {
    const u = await store.upsertUser(h);
    users[h] = u.id;
    await store.recordTermsAcceptance(u.id, 1, "imessage");
    await ledger.grant({ userId: u.id, amount: 100n, idem: `g:${h}` });
  }
  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => id, clock: () => now.value });
  const files = new Map<string, Buffer>();
  const pipeline = new InboundPipeline({
    store,
    transport,
    media,
    fetcher: async (url) => ({ ok: files.has(url), status: files.has(url) ? 200 : 404, body: files.get(url) ?? Buffer.alloc(0) }),
    handler: agentHandler({ store, betStore, engine, ledger, siteUrl: "https://x.test", botName: "bookie", clock: () => now.value, intake: { proofStore, media, clock: () => now.value }, runTurn: async () => [] }),
    botNames: ["bookie"],
    onCardPosted: (betId, id) => betStore.setCardMessageId(betId, id),
    senderHasOpenBet: (chatId, userId) => awaitsProof(betStore, chatId, userId),
  });
  const msg = (id: string, from: string, text: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: from, text, isGroup: true, ...extra });
  const deps = { store, betStore, engine, outbox, pipeline, proofStore, clock: () => now.value, jobRunners: { judge: (payload: Record<string, unknown>) => runJudgeJob({ betStore, proofStore, media, engine, judge }, payload as { betId: string; proofId: string; pass: 1 | 2 }) } };
  return { store, betStore, proofStore, media, ledger, transport, pipeline, msg, now, deps, files, users };
}

async function lockedBet(w: Awaited<ReturnType<typeof world>>): Promise<Bet> {
  await w.pipeline.handle(w.msg("m1", "+1matt", "!bet I make the shot ; 20 ; tomorrow"), {});
  const card = w.transport.sends[0];
  await w.pipeline.handle(w.msg("r1", "+1jake", "", { reaction: { targetProviderMessageId: card.providerMessageId, kind: "affirm", removed: false } }), {});
  const bet = [...w.betStore.bets.values()][0];
  expect(bet.status).toBe("locked");
  return bet;
}

describe("proof → judge → verdict", () => {
  const passJudge: Judge = async ({ bet }) => ({
    model: "fake",
    verdict: { outcome: "for", confidence: 0.93, criteria_checks: bet.proofCriteria.required.map((c) => ({ criterion: c, met: true, evidence: "seen" })), challenge_token_visible: true, tamper_flags: [], reasoning: "clearly in" },
  });

  it("a photo from a participant is stored, judged on the tick, and the verdict posted with a dispute window", async () => {
    const w = await world(passJudge);
    const bet = await lockedBet(w);
    w.files.set("https://cdn/p1.png", await png(5));
    const res = await w.pipeline.handle(w.msg("p1", "+1matt", "", { attachments: [{ url: "https://cdn/p1.png", mime: "image/png" }] }), {});
    expect(res.outcome).toBe("processed");
    expect((await w.betStore.get(bet.id))?.status).toBe("proof_submitted");
    expect(w.media.files.size).toBe(1);
    expect(w.proofStore.proofs[0].phash).toMatch(/^[0-9a-f]{16}$/);
    expect(w.transport.transcript("g1").at(-1)).toMatch(/Proof received/);

    const report = await tick(w.deps);
    expect(report.jobsRun).toBe(1);
    const after = await w.betStore.get(bet.id);
    expect(after?.status).toBe("verdict_posted");
    expect(after?.verdict?.outcome).toBe("for");
    expect(w.proofStore.verdicts[0].challengeTokenVisible).toBe(true);
    expect(w.transport.transcript("g1").at(-1)).toMatch(/VERDICT .* claim stands/);

    w.now.value = at(30);
    await tick(w.deps);
    expect((await w.betStore.get(bet.id))?.status).toBe("settled");
    expect((await w.ledger.wallet(w.users["+1matt"])).available).toBe(120n);
    expect(w.ledger.balance(escrowAccount(bet.id))).toBe(0n);
  });

  it("rejects a re-sent near-duplicate and a non-participant's photo is ignored", async () => {
    const w = await world(passJudge);
    await lockedBet(w);
    const original = await png(9);
    w.files.set("https://cdn/a.png", original);
    w.files.set("https://cdn/a2.jpg", await sharp(original).jpeg({ quality: 60 }).toBuffer());
    await w.pipeline.handle(w.msg("p1", "+1matt", "", { attachments: [{ url: "https://cdn/a.png", mime: "image/png" }] }), {});
    await w.pipeline.handle(w.msg("p2", "+1matt", "", { attachments: [{ url: "https://cdn/a2.jpg", mime: "image/jpeg" }] }), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/same shot/);
    expect(w.proofStore.proofs).toHaveLength(1);

    const stranger = await w.store.upsertUser("+1stranger");
    await w.store.recordTermsAcceptance(stranger.id, 1, "imessage");
    w.files.set("https://cdn/s.png", await png(2));
    const res = await w.pipeline.handle(w.msg("p3", "+1stranger", "", { attachments: [{ url: "https://cdn/s.png", mime: "image/png" }] }), {});
    expect(res.outcome).toBe("ignored");
  });

  it("missing challenge token caps confidence → bot asks for better proof", async () => {
    const noToken: Judge = async () => ({ model: "fake", verdict: { outcome: "for", confidence: 0.95, criteria_checks: [], challenge_token_visible: false, tamper_flags: [], reasoning: "in, but no token" } });
    const w = await world(noToken);
    const bet = await lockedBet(w);
    w.files.set("https://cdn/p.png", await png(4));
    await w.pipeline.handle(w.msg("p1", "+1matt", "", { attachments: [{ url: "https://cdn/p.png", mime: "image/png" }] }), {});
    await tick(w.deps);
    expect((await w.betStore.get(bet.id))?.status).toBe("locked");
    expect(w.proofStore.verdicts[0].confidence).toBe(0.5);
    expect(w.transport.transcript("g1").at(-1)).toMatch(/Couldn't verify/);
  });

  it("a failed download marks the inbox row failed and sends nothing", async () => {
    const w = await world(passJudge);
    await lockedBet(w);
    const before = w.transport.sends.length;
    const res = await w.pipeline.handle(w.msg("p1", "+1matt", "", { attachments: [{ url: "https://cdn/missing.png", mime: "image/png" }] }), {});
    expect(res).toMatchObject({ outcome: "failed", error: expect.stringMatching(/download failed \(404\)/) });
    expect(w.transport.sends.length).toBe(before);
  });
});
