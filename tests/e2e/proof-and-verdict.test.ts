/**
 * Cassette: a locked bet gets a photo in the thread, the judge job runs on
 * the tick, the verdict card lands, the dispute window passes, points move.
 * Then the same with a video, which goes through the frame renderer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/src/jobs/tick";
import { escrowAccount } from "@/src/ledger/types";
import { fakeJudge, HANDLES, png, T0, world, type CassetteStep, type World } from "./harness";

const cassette: CassetteStep[] = [
  {
    match: /says I make this shot/i,
    tool: {
      name: "create_bet",
      input: (snap) => ({
        claim: "I make a half-court shot",
        stake_points: 20,
        deadline: "tomorrow",
        proof_summary: "the shot going in",
        proof_required: ["ball goes through the hoop"],
        against_user_ids: [snap.members.find((m) => m.displayName === "Jake")?.id],
        no_proof_rule: "auto_loss",
      }),
    },
  },
];

async function lockedBet(w: World) {
  await w.send(HANDLES.matt, "hey mushy");
  const introId = w.transport.sends[0].providerMessageId;
  await w.react(HANDLES.matt, introId);
  await w.react(HANDLES.jake, introId);
  await w.send(HANDLES.matt, "mushy 20 says I make this shot by tomorrow, jake you in?");
  await w.react(HANDLES.jake, w.lastSend()!.providerMessageId);
  expect(w.bet().status).toBe("locked");
  return w.bet();
}

const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);

describe("e2e: proof and verdict", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("photo → judge job on the tick → verdict card → settles after the dispute window", async () => {
    const w = await world({ cassette });
    const bet = await lockedBet(w);

    const res = await w.photo(HANDLES.matt, "https://cdn.test/shot.png", await png(5));
    expect(res).toMatchObject({ outcome: "processed" });
    expect(w.bet().status).toBe("proof_submitted");
    expect(w.transcript().at(-1)).toMatch(/proof's in/);
    expect(w.proofStore.jobs).toHaveLength(1);

    const report = await tick(w.tickDeps);
    expect(report).toMatchObject({ jobsRun: 1, jobsFailed: 0 });
    expect(w.bet().status).toBe("verdict_posted");
    expect(w.bet().verdict).toMatchObject({ outcome: "for", pass: 1 });
    expect(w.transcript().at(-1)).toMatch(/VERDICT/);

    w.now.value = hours(30);
    vi.setSystemTime(hours(30));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(120n);
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).available).toBe(80n);
    expect(w.ledger.balance(escrowAccount(bet.id))).toBe(0n);
  });

  it("a losing verdict pays the other side", async () => {
    const w = await world({ cassette, judge: fakeJudge(() => ({ outcome: "against", reasoning: "airball" })) });
    await lockedBet(w);
    await w.photo(HANDLES.matt, "https://cdn.test/miss.png", await png(6));
    await tick(w.tickDeps);
    expect(w.bet().verdict?.outcome).toBe("against");
    w.now.value = hours(30);
    vi.setSystemTime(hours(30));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(80n);
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).available).toBe(120n);
  });

  it("video proof is rendered to frames before judging", async () => {
    const w = await world({ cassette });
    await lockedBet(w);
    const fakeMov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(4096, 7)]);
    const res = await w.photo(HANDLES.matt, "https://cdn.test/shot.mov", fakeMov, "video/quicktime");
    expect(res).toMatchObject({ outcome: "processed" });
    expect(w.proofStore.proofs[0].mime).toMatch(/^video\//);
    const report = await tick(w.tickDeps);
    expect(report).toMatchObject({ jobsRun: 1, jobsFailed: 0 });
    expect(w.bet().status).toBe("verdict_posted");
    expect(w.proofStore.verdicts[0].model).toBe("fake-judge");
  });

  it("no proof by the deadline posts an auto-loss verdict, then settles after the dispute window", async () => {
    const w = await world({ cassette });
    const bet = await lockedBet(w);
    const grace = new Date(new Date(bet.deadlineAt).getTime() + (bet.proofGraceHours + 1) * 3600_000);
    w.now.value = grace;
    vi.setSystemTime(grace);
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("verdict_posted");
    expect(w.bet().verdict?.outcome).toBe("against");

    const afterWindow = new Date(grace.getTime() + 25 * 3600_000);
    w.now.value = afterWindow;
    vi.setSystemTime(afterWindow);
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).available).toBe(120n);
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(80n);
  });
});
