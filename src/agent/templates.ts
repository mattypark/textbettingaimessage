import type { TurnContext } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";

/**
 * Canned replies for the messages that don't need a model: a bare wake
 * word, "help", thanks, greetings. Zero tokens, instant, same voice. The
 * model only runs when there is a bet to parse or something to reason
 * about. Picks a line by message id so replays stay stable.
 */
const WAKE_LINES = ["what's the bet", "say the bet, i'll write it up", "who's betting what", "run it — bet, stake, deadline", "i'm here, what we betting on"];

const HELP_LINES = (bot: string) =>
  [
    `say "hey ${bot}" then the bet — "20 says i make this shot by friday, jake you in?"`,
    "i post the card, everyone 👍 to lock, proof goes in the thread, i call it",
    `"!bet thing ; 20 ; friday" also works, and "${bot} invite" gets you a link`,
  ].join("\n");

const THANKS = ["np", "ez", "gg", "🫡", "say less"];

const BARE_WAKE = /^(hey|yo|hi|hello|sup|ok|okay|ayo|aye)?\s*@?BOT[\s!?.]*$/i;
const HELP = /^(hey|yo)?\s*@?BOT[,:]?\s*(help|how (does|do) (this|you) work|what (can|do) you do|commands|rules\??)\s*[!?.]*$/i;
const THANKS_RE = /^(?:(?:hey|yo)?\s*@?BOT[,:]?\s*(?:thanks|thank you|ty|thx|nice|gg|lol|lmao|w|clutch)|(?:thanks|thank you|ty|thx|nice|gg|w)[,]?\s*@?BOT)\s*[!?.]*$/i;
const GREETING = /^(hey|yo|hi|hello|sup)\s+@?BOT[,:]?\s*(how are you|what'?s up|wyd|you up)\s*[!?.]*$/i;

function withBot(re: RegExp, bot: string): RegExp {
  return new RegExp(re.source.replace(/BOT/g, bot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), re.flags);
}

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export type TemplateKind = "wake" | "help" | "thanks" | "greeting";

/** Null = not a template; let the scripted flow, a command, or the model handle it. */
export function templateReply(ctx: TurnContext, botName: string): { kind: TemplateKind; messages: OutboundMessage[] } | null {
  const text = ctx.event.text.trim();
  if (!text || ctx.event.reaction || ctx.event.attachments.length) return null;
  const seed = ctx.event.providerMessageId;
  if (withBot(HELP, botName).test(text)) return { kind: "help", messages: [{ text: HELP_LINES(botName) }] };
  if (withBot(BARE_WAKE, botName).test(text)) return { kind: "wake", messages: [{ text: pick(WAKE_LINES, seed) }] };
  if (withBot(THANKS_RE, botName).test(text)) return { kind: "thanks", messages: [{ text: pick(THANKS, seed) }] };
  if (withBot(GREETING, botName).test(text)) return { kind: "greeting", messages: [{ text: pick(["chillin, what's the bet", "vibing — who's betting what"], seed) }] };
  return null;
}

/**
 * Cheap pre-filter for the attention window: chatter with no stake shape,
 * no question and no bot-ish verb never reaches the classifier.
 */
const WORTH_A_LOOK = /\?|\$\s?\d|\b\d{2,}\b|\b\d+\s*(pts?|points?|bucks|dollars)\b|\b(bet|says|wager|odds|lock|accept|decline|cancel|dispute|balance|leaderboard|standings|invite|link|paid|sent|got it|proof|deadline|make it|change|call it|who|what|how)\b/i;

export function worthClassifying(text: string): boolean {
  return WORTH_A_LOOK.test(text);
}
