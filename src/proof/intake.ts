import type { BetEngine } from "@/src/bets/engine";
import { IllegalTransition } from "@/src/bets/state-machine";
import type { BetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";
import type { StoredAttachment } from "@/src/transport/attachments";
import type { InboundEvent, OutboundMessage } from "@/src/transport/types";
import { readExif } from "./exif";
import { averageHash, hamming, NEAR_DUPLICATE_BITS } from "./hash";
import type { MediaStore } from "./media-store";
import type { ProofStore } from "./store";

export interface IntakeDeps {
  betStore: BetStore;
  proofStore: ProofStore;
  media: MediaStore;
  engine: BetEngine;
  clock?: () => Date;
}

/** Gate helper: does this sender have a bet in the chat that can take proof right now? */
export async function awaitsProof(betStore: BetStore, chatId: string, userId: string): Promise<boolean> {
  return (await betsAwaitingProof(betStore, chatId, userId)).length > 0;
}

/** Locked bets in this chat where the sender is a participant, newest first. */
export async function betsAwaitingProof(betStore: BetStore, chatId: string, userId: string): Promise<Bet[]> {
  return (await betStore.openBetsInChat(chatId))
    .filter((b) => (b.status === "locked" || b.status === "proof_submitted") && b.participants.some((p) => p.userId === userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Attaches media from a participant to their open bet: hash, dedupe, EXIF,
 * persist, then fire PROOF into the engine (which enqueues the judge).
 */
export async function intakeProof(
  deps: IntakeDeps,
  event: InboundEvent,
  attachments: StoredAttachment[],
  chatId: string,
  userId: string,
  betId?: string
): Promise<OutboundMessage[]> {
  const candidates = await betsAwaitingProof(deps.betStore, chatId, userId);
  const bet = betId ? candidates.find((b) => b.id === betId) : candidates[0];
  if (!bet) return [];
  if (!betId && candidates.length > 1) {
    return [{ text: `which bet is this proof for? ${candidates.map((b) => `#${b.id.slice(0, 6)} "${b.claim}"`).join(" · ")} — reply with the number.` }];
  }

  const existing = await deps.proofStore.proofsForBet(bet.id);
  const replies: OutboundMessage[] = [];

  for (const att of attachments) {
    const bytes = await deps.media.get(att.storagePath);
    const isImage = att.mime.startsWith("image/");
    const phash = isImage ? await averageHash(bytes).catch(() => null) : null;
    const exif = isImage ? await readExif(bytes) : {};

    const dupe = existing.find((p) => p.sha256 === att.sha256 || (phash && p.phash && hamming(p.phash, phash) < NEAR_DUPLICATE_BITS));
    if (dupe) {
      replies.push({ text: `that's the same shot as before (#${bet.id.slice(0, 6)}). send a new one.` });
      continue;
    }

    const proof = await deps.proofStore.createProof({
      betId: bet.id,
      submitterId: userId,
      providerMessageId: event.providerMessageId,
      storagePath: att.storagePath,
      mime: att.mime,
      bytes: att.bytes,
      sha256: att.sha256,
      phash,
      exif,
      capturedAt: exif.capturedAt ?? null,
    });
    existing.push(proof);

    try {
      await deps.engine.apply(bet.id, { type: "PROOF", userId, proofId: proof.id });
    } catch (error) {
      if (error instanceof IllegalTransition) {
        replies.push({ text: `can't take proof for #${bet.id.slice(0, 6)} right now: ${error.message.replace(/^cannot PROOF from \w+: ?/, "")}` });
        continue;
      }
      throw error;
    }
  }
  return replies;
}
