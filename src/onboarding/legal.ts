import { TERMS_VERSION } from "./terms";

/**
 * The full terms and privacy policy, in one place. The /terms and /privacy
 * pages, the sign sheet and the intro all read from here, so the text a
 * person signs is the text the site shows. Plain English on purpose.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}

export const LEGAL_UPDATED = "September 17, 2026";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "what mushy is",
    body: [
      "Mushy is a scorekeeper for friendly bets between people who already know each other and share a group chat. It writes bets down, tracks who accepted, collects proof, records who called the result, and keeps a points tally.",
      "Mushy is not a sportsbook, a casino, an exchange, a payment service, or an escrow. It never holds, moves, receives, or pays out money.",
    ],
  },
  {
    heading: "points",
    body: [
      "Points are a game score. They have no cash value, cannot be bought, sold, transferred, or redeemed, and may be reset or adjusted at any time. Points are not money and never convert to money.",
    ],
  },
  {
    heading: "social stakes and real money",
    body: [
      "A social stake (\"loser buys dinner\", \"$20 each\") is a private promise between the people in the chat. Mushy only keeps track of it.",
      "If the people in a chat choose to exchange real money over a bet, they do so directly with each other, through their own payment apps, on their own terms, and at their own risk. Mushy may show links that open those apps with an amount pre-filled; it never processes, holds, guarantees, collects, or refunds any payment.",
      "A person the chat picks to hold a pot is acting as a friend, not as an agent of Mushy. Mushy is not responsible for anyone paying, not paying, paying late, or paying the wrong amount.",
      "You are responsible for knowing whether wagering between friends is lawful where you are, and for any tax or reporting that applies to you. Do not use Mushy where such wagering is unlawful.",
    ],
  },
  {
    heading: "results, proof, and disputes",
    body: [
      "Results are called by the person the bet names (usually the other side), by an automated judge reading the proof against the criteria written when the bet was created, or by a referee the chat picked. Proof sent to the bot may be stored so a result can be reviewed.",
      "A result can be disputed once within 24 hours. Disputes are reviewed by a second look or by the referee. When a result cannot be determined, the bet is voided and points return to everyone.",
      "Mushy can be wrong. Results are best-effort calls on friendly bets, not decisions with legal effect. Mushy may void, correct, or cancel any bet at any time.",
    ],
  },
  {
    heading: "who can use it",
    body: [
      "You must be at least 18, or the age of majority where you live if higher. Do not bet on illegal acts, on harm to anyone, on people who are not in the chat, or in ways that harass anyone. Keep it friendly. Mushy may leave a chat or block a number at any time.",
    ],
  },
  {
    heading: "your account and messages",
    body: [
      "You control your phone number and the name you give the bot. Messages sent in a chat the bot is in are processed to run bets. Do not send anything you would not want stored, and do not send anyone else's private information.",
    ],
  },
  {
    heading: "no warranty, no liability",
    body: [
      "Mushy is provided as-is and as-available, with no warranty of any kind. It may be unavailable, slow, or wrong. To the fullest extent the law allows, Mushy and the people who run it are not liable for any loss, including money exchanged between users, missed or wrong results, lost data, or anything arising from a bet. If liability cannot be excluded, it is limited to one dollar.",
      "You agree to cover Mushy and the people who run it against claims that arise from your bets, your payments to other users, or your breach of these terms.",
    ],
  },
  {
    heading: "changes and contact",
    body: [
      `These terms are version ${TERMS_VERSION}. When they change in substance, the bot asks you to accept them again before your next stake. Questions: the email on the site's contact page.`,
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "what we store",
    body: [
      "Your phone number, the name you tell the bot to call you, and the payment handles you choose to share (a Venmo username, a $cashtag, a PayPal.me name, or the number you use for Apple Cash).",
      "Messages sent in chats the bot is in, so it can act on bets and answer. Proof photos and videos, so a result can be called and reviewed.",
      "Bets, points, results, disputes, and the audit trail of every change. Your signature on the terms: the name you typed, when, from which address.",
    ],
  },
  {
    heading: "what we never store",
    body: ["Card numbers, bank details, or balances. Mushy never sees a payment; the links it shows open your own apps."],
  },
  {
    heading: "what we don't do",
    body: ["Sell your data. Show ads. Share your messages with anyone outside the people running the service and the processors below. Contact people who have not added the bot to a chat."],
  },
  {
    heading: "processors",
    body: [
      "Messages are delivered through an iMessage API provider (Linq). Data is stored on Supabase. When automated judging is on, proof is evaluated by a model provider (OpenAI or Anthropic). The site is hosted on Vercel. Each processes data only to provide the service.",
    ],
  },
  {
    heading: "cookies",
    body: ["The website sets only the cookies needed to keep you signed in. No advertising or analytics cookies."],
  },
  {
    heading: "your choices",
    body: [
      "Remove the bot from a chat to stop new messages being stored. Text the bot \"delete my data\" or email us and we delete your account, signature, and media within 30 days, except records needed to resolve an open dispute.",
    ],
  },
];
