/**
 * Single source of truth for the terms. The iMessage intro, the
 * `explain_terms` tool, and the /terms page all read from here so the three
 * never drift. Bump TERMS_VERSION when the substance changes; users must
 * re-accept before their next stake.
 */
export const TERMS_VERSION = 1;

export const TERMS_SUMMARY = [
  "Points only. Points have no cash value, can't be bought, sold, or redeemed, and reset if the group agrees.",
  "Social stakes (\"loser buys dinner\", \"$20 loser pays\") are between friends — the bot only keeps score. Share a Venmo / Cash App / PayPal / Apple Cash handle and the bot posts a link that opens the payer's own app; it never holds, moves, or charges money.",
  "The bot judges proof against the criteria locked when the bet was made. You can dispute a verdict within 24h by posting a small points bond.",
  "Be 18+, keep it friendly, no bets on illegal stuff or on people who aren't in the chat.",
  "We store your phone number, the messages you send the bot, and proof media so we can judge bets.",
];

export function termsUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/terms`;
}

export function introMessage(botName: string, siteUrl: string): string {
  return [
    `yo, i'm ${botName} 🍡 i keep score on bets in this chat.`,
    `say "hey ${botName}" then the bet — "20 says i make this shot by friday, jake you in?" — i post the card, everyone 👍 to lock it, proof goes in the thread, i call it.`,
    `points, not cash. tap "add" on my card so i've got a name in here.`,
    `rules (v${TERMS_VERSION}): ${termsUrl(siteUrl)} — 👍 this message or say "i agree" and you're in.`,
  ].join("\n");
}
