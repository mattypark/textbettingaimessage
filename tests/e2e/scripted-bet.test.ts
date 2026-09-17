/**
 * Zero-token path: MODEL_MODE=off, JUDGE_MODE=confirm. "hey mushy" opens
 * the builder, three answers make the card, a 👍 locks it, proof lands,
 * the opponent calls it, points settle. No cassette step ever runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/src/jobs/tick";
import { HANDLES, png, T0, world } from "./harness";

const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);

describe("e2e: scripted bet, no model", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("builds a bet from three answers, opponent confirms the result, no tokens spent", async () => {
    const w = await world({ cassette: [], modelMode: "off", judgeMode: "confirm" });

    await w.send(HANDLES.matt, "hey mushy");
    const introId = w.transport.sends[0].providerMessageId;
    expect(w.transcript().at(-1)).toMatch(/bet/); // canned, no model
    await w.react(HANDLES.matt, introId);
    await w.react(HANDLES.jake, introId);

    // Draft opened by the wake word; each answer is a plain follow-up inside the attention window.
    vi.setSystemTime(new Date(T0.getTime() + 20_000));
    await w.send(HANDLES.matt, "i make this half court shot");
    expect(w.transcript().at(-1)).toMatch(/^how much\?/);
    await w.send(HANDLES.matt, "20");
    expect(w.transcript().at(-1)).toMatch(/^by when\?/);
    await w.send(HANDLES.matt, "friday");
    const card = w.lastSend()!;
    expect(card.message.text).toContain('Matt says: "i make this half court shot"');
    expect(card.message.text).toContain("stake: 20 pts each");
    expect(card.message.idempotencyKey).toMatch(/^card:/);
    expect(w.bet().proofCriteria.challengeTokenRequired).toBe(false);
    expect(w.toolLog).toHaveLength(0);
    expect(await w.store.getDraft(w.chatIdOf(), w.users[HANDLES.matt])).toBeNull();

    // A stranger's 👍 takes the other side and locks it.
    await w.react(HANDLES.jake, card.providerMessageId);
    expect(w.bet().status).toBe("locked");
    expect(w.transcript().at(-1)).not.toMatch(/get the word/);

    // Proof → the opponent is asked to call it.
    await w.photo(HANDLES.matt, "https://cdn.test/shot.png", await png(5));
    expect(w.bet().judgeKind).toBe("referee");
    expect(w.bet().refereeUserId).toBe(w.users[HANDLES.jake]);
    expect(w.transcript().at(-1)).toMatch(/Jake you're calling it: "call #\w+ yes"/);
    await tick(w.tickDeps); // judge job moves it to judging without any model
    expect(w.bet().status).toBe("judging");

    await w.send(HANDLES.jake, `call #${w.bet().id.slice(0, 6)} yes`);
    expect(w.bet().status).toBe("verdict_posted");
    w.now.value = hours(30);
    vi.setSystemTime(hours(30));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(120n);
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).available).toBe(80n);
  });

  it("scraps a draft on 'nvm' and never calls the model for unmatched text", async () => {
    const w = await world({ cassette: [{ match: /.*/, say: "MODEL RAN" }], modelMode: "off" });
    await w.send(HANDLES.matt, "hey mushy");
    vi.setSystemTime(new Date(T0.getTime() + 10_000));
    await w.send(HANDLES.matt, "nvm");
    expect(w.transcript().at(-1)).toBe("scrapped");
    await w.send(HANDLES.matt, "mushy do something weird");
    expect(w.transcript().at(-1)).toMatch(/say the bet in one line/);
    expect(w.transcript().join("\n")).not.toContain("MODEL RAN");
  });
});
