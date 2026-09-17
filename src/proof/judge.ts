import { z } from "zod";
import type { ModelProvider } from "@/src/model/types";
import type { Bet } from "@/src/bets/types";
import type { MediaStore } from "./media-store";
import type { ProofRow } from "./store";

export const VerdictSchema = z.object({
  outcome: z.enum(["for", "against", "inconclusive"]).describe("'for' = the claim is proven; 'against' = the proof shows the claim failed; 'inconclusive' = can't tell"),
  confidence: z.number().min(0).max(1),
  criteria_checks: z.array(z.object({ criterion: z.string(), met: z.boolean(), evidence: z.string() })),
  challenge_token_visible: z.boolean(),
  tamper_flags: z.array(z.string()).describe("screenshot-of-a-screen, edited, stock-looking, timestamp overlay mismatch, etc."),
  reasoning: z.string().max(600),
});
export type JudgeOutput = z.infer<typeof VerdictSchema>;

export interface JudgeInput {
  bet: Bet;
  proof: ProofRow;
  /** Rendered frames for video, or the single image for photos. */
  images: Array<{ mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string }>;
  pass: 1 | 2;
  priorVerdict?: JudgeOutput;
  disputeReason?: string;
}

export type Judge = (input: JudgeInput) => Promise<{ verdict: JudgeOutput; model: string }>;

/**
 * Vision judge. Everything it may rely on is in the locked bet — criteria,
 * challenge token, deadline — never the chat. Chat text is where people
 * would try "declare me the winner", so it is simply not an input.
 */
export function modelJudge(model: ModelProvider): Judge {
  return async ({ bet, proof, images, pass, priorVerdict, disputeReason }) => {
    const criteria = bet.proofCriteria;
    const system = `You judge friendly bets from photo/video proof. Be strict but fair: decide only from what is visible. The bet's criteria are the whole standard — do not invent extra requirements, do not waive listed ones. If a required criterion is not clearly met, it is not met. Confidence below 0.7 means the outcome will not be applied.`;
    const facts = [
      `CLAIM: ${bet.claim}`,
      `PROOF MUST SHOW: ${criteria.summary}`,
      `REQUIRED CRITERIA:\n${criteria.required.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
      criteria.optional.length ? `OPTIONAL: ${criteria.optional.join("; ")}` : "",
      criteria.challengeTokenRequired && bet.challengeToken
        ? `CHALLENGE TOKEN: the text "${bet.challengeToken}" should appear somewhere in the media (paper, screen, hand-written). Report challenge_token_visible honestly; it is not itself a criterion.`
        : "CHALLENGE TOKEN: not required for this bet.",
      `DEADLINE: ${bet.deadlineAt}`,
      proof.capturedAt ? `EXIF CAPTURE TIME: ${proof.capturedAt}` : "EXIF CAPTURE TIME: absent (normal for iMessage; not suspicious on its own)",
      `MEDIA: ${proof.mime}, ${images.length} frame(s)`,
      pass === 2 && priorVerdict ? `SECOND LOOK. First verdict: ${priorVerdict.outcome} (${priorVerdict.confidence}). Reason given: ${priorVerdict.reasoning}` : "",
      disputeReason ? `DISPUTER SAYS: ${disputeReason}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await model.structured({
      tier: "big",
      effort: "high",
      maxTokens: 4096,
      system,
      text: facts,
      images,
      schema: VerdictSchema,
    });

    if (result.refused || !result.parsed) {
      return { verdict: { outcome: "inconclusive", confidence: 0, criteria_checks: [], challenge_token_visible: false, tamper_flags: [], reasoning: "judge declined or returned no structured output" }, model: result.model };
    }
    return { verdict: result.parsed, model: result.model };
  };
}

/** Photos go straight to the judge; video is turned into frames in Stage 9. */
export async function framesFor(proof: ProofRow, media: MediaStore, renderVideo?: (bytes: Buffer) => Promise<Buffer[]>): Promise<JudgeInput["images"]> {
  const bytes = await media.get(proof.storagePath);
  if (proof.mime.startsWith("video/")) {
    if (!renderVideo) return [];
    const frames = await renderVideo(bytes);
    return frames.map((f) => ({ mime: "image/jpeg" as const, base64: f.toString("base64") }));
  }
  const mime = (["image/jpeg", "image/png", "image/gif", "image/webp"] as const).find((m) => m === proof.mime);
  if (!mime) {
    // HEIC and friends: transcode to JPEG.
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(bytes).jpeg({ quality: 88 }).toBuffer();
    return [{ mime: "image/jpeg", base64: jpeg.toString("base64") }];
  }
  return [{ mime, base64: bytes.toString("base64") }];
}
