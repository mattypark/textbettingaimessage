/**
 * End-to-end harness: the real InboundPipeline, agent handler, engine,
 * ledger, proof intake and tick, on memory stores and the FakeTransport.
 * Claude is replaced by a cassette (FakeModel) that drives the real tools,
 * and the vision judge by a scripted verdict (FakeJudge).
 */
import sharp from "sharp";
import { expect } from "vitest";
import { snapshot, type ChatSnapshot } from "@/src/agent/context";
import { agentHandler } from "@/src/agent/handler";
import { buildTools, type ToolDeps } from "@/src/agent/tools";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline, type TurnContext } from "@/src/inbound/pipeline";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { introMessage } from "@/src/onboarding/terms";
import { awaitsProof } from "@/src/proof/intake";
import type { Judge, JudgeOutput } from "@/src/proof/judge";
import { MemoryMediaStore } from "@/src/proof/media-store";
import { runJudgeJob } from "@/src/proof/run-judge";
import { MemoryProofStore } from "@/src/proof/store";
import { settleUpFor } from "@/src/settle/settle-up";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";
import type { OutboundMessage } from "@/src/transport/types";

export const T0 = new Date("2026-09-17T12:00:00Z");
export const BOT = "mushy";
export const SITE = "https://mushy.test";

export interface CassetteStep {
  /** Matches the inbound text this step answers. First match wins. */
  match: RegExp;
  /** A tool call to make with the real tool runner; input may read the snapshot for member ids. */
  tool?: { name: string; input: (snap: ChatSnapshot, ctx: TurnContext) => Record<string, unknown> };
  /** Closing line after the tool (or the whole reply when there is no tool). */
  say?: string;
}

type Runnable = { name: string; run: (input: Record<string, unknown>) => Promise<string> };

/** Scripted stand-in for runAgentTurn: same snapshot, same tools, no model. */
export function fakeModel(deps: ToolDeps, cassette: CassetteStep[], log: string[] = []) {
  return async (ctx: TurnContext): Promise<OutboundMessage[]> => {
    const snap = await snapshot(ctx, deps.store, deps.betStore, deps.ledger, deps.clock?.());
    const session = { ctx, snap, replies: [] as OutboundMessage[] };
    const tools = buildTools(deps, session) as unknown as Runnable[];
    const step = cassette.find((s) => s.match.test(ctx.event.text));
    if (!step) return [];
    if (step.tool) {
      const tool = tools.find((t) => t.name === step.tool?.name);
      if (!tool) throw new Error(`cassette names unknown tool ${step.tool.name}`);
      log.push(await tool.run(step.tool.input(snap, ctx)));
    }
    if (step.say) session.replies.push({ text: step.say });
    return session.replies;
  };
}

export function fakeJudge(script: (bet: Parameters<Judge>[0]["bet"]) => Partial<JudgeOutput>): Judge {
  return async ({ bet }) => ({
    model: "fake-judge",
    verdict: {
      outcome: "for",
      confidence: 0.92,
      criteria_checks: bet.proofCriteria.required.map((c) => ({ criterion: c, met: true, evidence: "seen" })),
      challenge_token_visible: true,
      tamper_flags: [],
      reasoning: "scripted",
      ...script(bet),
    },
  });
}

export async function png(seed: number, w = 64, h = 64): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = ((i % w) * seed + Math.floor(i / w) * 7) % 251;
    raw[i * 3] = v;
    raw[i * 3 + 1] = (v * 3) % 255;
    raw[i * 3 + 2] = (v * 5) % 255;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

export interface WorldOptions {
  cassette: CassetteStep[];
  judge?: Judge;
  /** What the sonnet classifier would say for "maybe" messages. Default: addressed. */
  classifier?: (text: string) => boolean;
}

export const HANDLES = { matt: "+15029998282", jake: "+17135550101", sam: "+17135550102" } as const;

export async function world(opts: WorldOptions) {
  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const proofStore = new MemoryProofStore();
  betStore.jobSink = (kind, payload) => proofStore.enqueue(kind, payload);
  const media = new MemoryMediaStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const now = { value: T0 };
  const clock = () => now.value;
  const toolLog: string[] = [];

  const users: Record<string, string> = {};
  for (const handle of Object.values(HANDLES)) {
    const u = await store.upsertUser(handle);
    users[handle] = u.id;
    await ledger.grant({ userId: u.id, amount: 100n, idem: `grant:${handle}` });
  }
  await store.setDisplayName(users[HANDLES.matt], "Matt");
  await store.setDisplayName(users[HANDLES.jake], "Jake");
  await store.setDisplayName(users[HANDLES.sam], "Sam");

  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => id, clock, settleUp: settleUpFor(store) });
  const toolDeps: ToolDeps = { store, betStore, engine, ledger, siteUrl: SITE, clock };
  const files = new Map<string, Buffer>();
  const judge = opts.judge ?? fakeJudge(() => ({}));
  const renderVideo = async () => [await png(42)];

  const pipeline = new InboundPipeline({
    store,
    transport,
    media,
    fetcher: async (url) => ({ ok: files.has(url), status: files.has(url) ? 200 : 404, body: files.get(url) ?? Buffer.alloc(0) }),
    handler: agentHandler({
      ...toolDeps,
      botName: BOT,
      classifier: async (text) => (opts.classifier ?? (() => true))(text),
      intake: { proofStore, media, clock },
      runTurn: fakeModel(toolDeps, opts.cassette, toolLog),
    }),
    botNames: [BOT],
    introMessage: () => ({ text: introMessage(BOT, SITE) }),
    onCardPosted: (betId, id) => betStore.setCardMessageId(betId, id),
    senderHasOpenBet: (chatId, userId) => awaitsProof(betStore, chatId, userId),
  });

  const tickDeps = {
    store,
    betStore,
    engine,
    outbox,
    pipeline,
    proofStore,
    clock,
    jobRunners: {
      judge: (payload: Record<string, unknown>) =>
        runJudgeJob({ betStore, proofStore, media, engine, judge, renderVideo }, payload as { betId: string; proofId: string; pass: 1 | 2 }),
    },
  };

  let seq = 0;
  const send = (from: string, text: string, extra: Record<string, unknown> = {}) =>
    pipeline.handle(JSON.stringify({ providerMessageId: `m${++seq}`, providerChatId: "group-1", senderHandle: from, text, isGroup: true, ...extra }), {});
  const react = (from: string, targetProviderMessageId: string, kind: "affirm" | "decline" = "affirm") =>
    send(from, "", { reaction: { targetProviderMessageId, kind, removed: false } });
  const photo = (from: string, url: string, bytes: Buffer, mime = "image/png") => {
    files.set(url, bytes);
    return send(from, "", { attachments: [{ url, mime }] });
  };
  const transcript = () => transport.transcript("group-1");
  const lastSend = () => transport.sends.at(-1);
  const bet = () => {
    const b = [...betStore.bets.values()][0];
    expect(b, "a bet exists").toBeDefined();
    return b;
  };
  const inboxStatus = (providerMessageId: string) => {
    const row = [...store.inbox.entries()].find(([key]) => key.endsWith(`:${providerMessageId}`));
    return row ? { status: row[1].status, reason: row[1].error } : null;
  };

  return { store, betStore, proofStore, media, ledger, transport, pipeline, tickDeps, now, users, toolLog, send, react, photo, transcript, lastSend, bet, inboxStatus };
}

export type World = Awaited<ReturnType<typeof world>>;
