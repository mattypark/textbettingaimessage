/**
 * Single source of truth for the terms. The iMessage intro, the
 * `explain_terms` tool, and the /terms page all read from here so the three
 * never drift. Bump TERMS_VERSION when the substance changes; users must
 * re-accept before their next stake.
 */
export const TERMS_VERSION = 1;

export const TERMS_SUMMARY = [
  "Points only. Points have no cash value, can't be bought, sold, or redeemed, and reset if the group agrees.",
  "Social stakes (\"loser buys dinner\") are between friends — the bot only keeps score.",
  "The bot judges proof against the criteria locked when the bet was made. You can dispute a verdict within 24h by posting a small points bond.",
  "Be 18+, keep it friendly, no bets on illegal stuff or on people who aren't in the chat.",
  "We store your phone number, the messages you send the bot, and proof media so we can judge bets.",
];

export function termsUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/terms`;
}

export function introMessage(botName: string, siteUrl: string): string {
  return [
    `👋 I'm ${botName}. Add me to a group chat and text me a bet — "$20 says I make this shot by Friday" or "loser buys dinner if I lose the 5k".`,
    "I turn it into a card, everyone 👍 to lock, then send proof in the thread and I'll call it.",
    `Points only, no cash. Terms (v${TERMS_VERSION}): ${termsUrl(siteUrl)} — 👍 this message or reply "I agree" to accept.`,
  ].join("\n");
}
