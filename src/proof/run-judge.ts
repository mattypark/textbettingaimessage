import type { BetEngine } from "@/src/bets/engine";
import { IllegalTransition } from "@/src/bets/state-machine";
import type { BetStore } from "@/src/bets/store";
import { framesFor, type Judge } from "./judge";
import type { MediaStore } from "./media-store";
import type { ProofStore } from "./store";

export interface JudgeJobDeps {
  betStore: BetStore;
  proofStore: ProofStore;
  media: MediaStore;
  engine: BetEngine;
  /** Absent in confirm mode: only referee bets reach here, and they need no model. */
  judge?: Judge;
  renderVideo?: (bytes: Buffer) => Promise<Buffer[]>;
}

/**
 * One judge job: load the proof, render frames, ask the judge, record the
 * verdict, push VERDICT (pass 1) or DISPUTE_DECISION (pass 2) into the engine.
 */
export async function runJudgeJob(deps: JudgeJobDeps, payload: { betId: string; proofId: string; pass: 1 | 2; disputeReason?: string }): Promise<void> {
  const bet = await deps.betStore.get(payload.betId);
  const proof = await deps.proofStore.getProof(payload.proofId);
  if (!bet || !proof) return;

  if (bet.judgeKind === "referee") {
    // The named human decides via referee_decide; the job only moves the bet into judging.
    if (payload.pass === 1) await deps.engine.apply(bet.id, { type: "JUDGE_START" }).catch(() => undefined);
    return;
  }

  if (payload.pass === 1) {
    try {
      await deps.engine.apply(bet.id, { type: "JUDGE_START" });
    } catch (error) {
      if (!(error instanceof IllegalTransition)) throw error;
      if (bet.status !== "judging") return; // superseded (another proof, void, etc.)
    }
  }

  if (!deps.judge) {
    await deps.engine.apply(bet.id, { type: "VERDICT", outcome: "inconclusive", confidence: 0, proofId: proof.id }).catch(() => undefined);
    return;
  }
  const images = await framesFor(proof, deps.media, deps.renderVideo);
  if (images.length === 0) {
    await deps.engine.apply(bet.id, { type: "VERDICT", outcome: "inconclusive", confidence: 0, proofId: proof.id }).catch(() => undefined);
    return;
  }

  const prior = payload.pass === 2 ? (await deps.proofStore.verdictsForBet(bet.id)).at(-1) : undefined;
  const { verdict, model } = await deps.judge({
    bet,
    proof,
    images,
    pass: payload.pass,
    priorVerdict: prior ? { outcome: prior.outcome, confidence: prior.confidence, criteria_checks: prior.criteriaChecks, challenge_token_visible: prior.challengeTokenVisible, tamper_flags: prior.tamperFlags, reasoning: prior.reasoning } : undefined,
    disputeReason: payload.disputeReason,
  });

  // A required token that is missing caps confidence so the outcome is not applied.
  const tokenRequired = bet.proofCriteria.challengeTokenRequired && Boolean(bet.challengeToken);
  const confidence = tokenRequired && !verdict.challenge_token_visible && verdict.outcome === "for" ? Math.min(verdict.confidence, 0.5) : verdict.confidence;

  await deps.proofStore.createVerdict({
    betId: bet.id,
    proofId: proof.id,
    pass: payload.pass,
    outcome: verdict.outcome,
    confidence,
    criteriaChecks: verdict.criteria_checks,
    challengeTokenVisible: verdict.challenge_token_visible,
    tamperFlags: verdict.tamper_flags,
    reasoning: verdict.reasoning,
    model,
  });
  await deps.proofStore.markProof(proof.id, "judged");

  if (payload.pass === 1) {
    await deps.engine.apply(bet.id, { type: "VERDICT", outcome: verdict.outcome, confidence, proofId: proof.id });
    return;
  }

  const challenged = bet.dispute?.challenged;
  if (!challenged) return;
  const overturned = verdict.outcome !== "inconclusive" && verdict.outcome !== challenged && confidence >= 0.7;
  if (verdict.outcome === "inconclusive" || confidence < 0.7) {
    await deps.engine.apply(bet.id, { type: "UNRESOLVABLE" });
    return;
  }
  await deps.engine.apply(bet.id, { type: "DISPUTE_DECISION", result: overturned ? "overturned" : "upheld", decidedBy: "ai" });
}
