import type { TurnHandler } from "./pipeline";

/**
 * Stage 1 handler: proves the round-trip. Replaced by the agent in Stage 4.
 * Reactions get a reaction back; text gets a one-line acknowledgement.
 */
export const echoHandler: TurnHandler = async ({ event, decision }) => {
  if (event.reaction) {
    return [{ text: `${event.reaction.kind === "affirm" ? "👍" : "👀"} noted, ${event.senderHandle}` }];
  }
  if (event.participantAdded) {
    return [{ text: "I'm in. Text \"bookie\" plus a bet to get started." }];
  }
  const what = event.attachments.length ? `${event.attachments.length} attachment(s)` : `"${event.text.slice(0, 60)}"`;
  return [{ text: `got it, ${event.senderHandle} — ${what} (${decision.reason})` }];
};
