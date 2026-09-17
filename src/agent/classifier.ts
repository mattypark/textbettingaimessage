import { z } from "zod";
import type { ModelProvider } from "@/src/model/types";

const Addressed = z.object({
  addressed: z.boolean().describe("true if this message is talking to the betting bot or proposing/acting on a bet"),
});

export type Classifier = (text: string, botName: string) => Promise<boolean>;

/**
 * Cheap yes/no for the mention gate's "maybe" branch (attention window or
 * stake-shaped text with no name). Runs on the small model so ordinary
 * chatter that happens to say "bet" doesn't cost a big-model turn.
 */
export function modelClassifier(model: ModelProvider): Classifier {
  return async (text, botName) => {
    const result = await model.structured({
      tier: "small",
      effort: "low",
      maxTokens: 256,
      system: `You screen messages in a friends' group chat for a betting bot named "${botName}". Say addressed=true only when the message is proposing a bet, accepting/declining one, or clearly asking the bot something. Casual use of "bet" as slang ("bet, see you at 8") is false.`,
      text,
      schema: Addressed,
    });
    return result.parsed?.addressed ?? false;
  };
}
