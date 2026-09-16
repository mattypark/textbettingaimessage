import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const Addressed = z.object({
  addressed: z.boolean().describe("true if this message is talking to the betting bot or proposing/acting on a bet"),
});

export type Classifier = (text: string, botName: string) => Promise<boolean>;

/**
 * Cheap yes/no for the mention gate's "maybe" branch (stake-shaped text with
 * no name). Runs on the smaller model so ordinary group chatter that happens
 * to say "bet" doesn't cost an Opus turn.
 */
export function claudeClassifier(client: Anthropic): Classifier {
  return async (text, botName) => {
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 256,
      output_config: { effort: "low", format: zodOutputFormat(Addressed) },
      system: `You screen messages in a friends' group chat for a betting bot named "${botName}". Say addressed=true only when the message is proposing a bet, accepting/declining one, or clearly asking the bot something. Casual use of "bet" as slang ("bet, see you at 8") is false.`,
      messages: [{ role: "user", content: text }],
    });
    return response.parsed_output?.addressed ?? false;
  };
}
