import type { Bet, BetStatus } from "@/src/bets/types";
import type { InviteView } from "@/src/access/store";
import type { WalletView } from "@/src/web/queries";
import type { ChatSummary, CriterionCheck, EventView, ProofView, VerdictView } from "@/src/web/data/types";

/**
 * Seeded world for WEB_DEMO=1. Fixed ids so links are stable between runs;
 * timestamps hang off "now" so "due in 2d" reads right in a screenshot.
 */
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const at = (hoursFromNow: number) => new Date(NOW + hoursFromNow * HOUR).toISOString();

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000a001";

export const DEMO_USERS = [
  { id: DEMO_USER_ID, name: "Matt", honor: 104 },
  { id: "00000000-0000-4000-8000-00000000a002", name: "Jake", honor: 96 },
  { id: "00000000-0000-4000-8000-00000000a003", name: "Priya", honor: 118 },
  { id: "00000000-0000-4000-8000-00000000a004", name: "Sam", honor: 88 },
  { id: "00000000-0000-4000-8000-00000000a005", name: "Dev", honor: 100 },
] as const;

const [MATT, JAKE, PRIYA, SAM, DEV] = DEMO_USERS.map((u) => u.id);

export const DEMO_CHATS: ChatSummary[] = [
  { id: "00000000-0000-4000-8000-00000000c001", name: "the boys 🏀" },
  { id: "00000000-0000-4000-8000-00000000c002", name: "gym crew" },
];
const [BOYS, GYM] = DEMO_CHATS.map((c) => c.id);

export const DEMO_WALLET: WalletView = { available: 140n, held: 45n, honorScore: 104, termsVersionAccepted: 1 };
export const DEMO_INVITE: InviteView = { code: "MATT0001", maxUses: 3, uses: 1 };

type Seed = Omit<Bet, "id" | "createdAt" | "acceptByAt" | "deadlineAt" | "proofGraceHours" | "noProofRule" | "version"> & {
  id: string;
  createdHoursAgo: number;
  deadlineInHours: number;
};

function build(s: Seed): Bet {
  const { createdHoursAgo, deadlineInHours, ...rest } = s;
  return {
    ...rest,
    createdAt: at(-createdHoursAgo),
    acceptByAt: at(-createdHoursAgo + 24),
    deadlineAt: at(deadlineInHours),
    proofGraceHours: 12,
    noProofRule: "auto_loss",
    version: 1,
  };
}

const pts = (n: number) => ({ kind: "points" as const, amount: BigInt(n), currency: "PTS" });
const side = (userId: string, s: "for" | "against", acceptedHoursAgo?: number) => ({
  userId,
  side: s,
  required: true,
  acceptedAt: acceptedHoursAgo === undefined ? undefined : at(-acceptedHoursAgo),
});
const criteria = (summary: string, required: string[], mediaKinds: Array<"photo" | "video"> = ["photo", "video"]) => ({
  summary,
  required,
  optional: [],
  challengeTokenRequired: true,
  mediaKinds,
});

export const DEMO_BET_IDS = {
  proposed: "00000000-0000-4000-8000-00000000b001",
  locked: "00000000-0000-4000-8000-00000000b002",
  proofSubmitted: "00000000-0000-4000-8000-00000000b003",
  verdictPosted: "00000000-0000-4000-8000-00000000b004",
  disputed: "00000000-0000-4000-8000-00000000b005",
  won: "00000000-0000-4000-8000-00000000b006",
  lost: "00000000-0000-4000-8000-00000000b007",
  expired: "00000000-0000-4000-8000-00000000b008",
} as const;

export const DEMO_BETS: Bet[] = [
  build({
    id: DEMO_BET_IDS.proposed,
    chatId: BOYS,
    creatorId: MATT,
    status: "proposed",
    claim: "I make a half-court shot by friday",
    stake: pts(20),
    participants: [side(MATT, "for", 2), side(JAKE, "against")],
    proofCriteria: criteria("video, ball leaves your hands from half court and goes in", ["shot taken from the half-court line", "ball goes through the hoop", "no cuts in the clip"], ["video"]),
    judgeKind: "bot",
    open: true,
    createdHoursAgo: 2,
    deadlineInHours: 70,
  }),
  build({
    id: DEMO_BET_IDS.locked,
    chatId: BOYS,
    creatorId: MATT,
    status: "locked",
    claim: "no doordash this week",
    stake: pts(15),
    participants: [side(MATT, "for", 30), side(PRIYA, "against", 29)],
    proofCriteria: criteria("bank or app screenshot friday showing zero delivery orders", ["order history screenshot", "this week's dates visible"], ["photo"]),
    judgeKind: "bot",
    lockedAt: at(-29),
    challengeToken: "otter-17",
    createdHoursAgo: 30,
    deadlineInHours: 110,
  }),
  build({
    id: DEMO_BET_IDS.proofSubmitted,
    chatId: GYM,
    creatorId: SAM,
    status: "proof_submitted",
    claim: "5k by sunday, under 30 minutes",
    stake: pts(10),
    participants: [side(SAM, "for", 60), side(MATT, "against", 58)],
    proofCriteria: criteria("watch screenshot, 5.00 km or more, time under 30:00", ["distance ≥ 5.00 km", "time under 30:00", "this week's date in frame"], ["photo"]),
    judgeKind: "bot",
    lockedAt: at(-58),
    challengeToken: "walrus-42",
    latestProofId: "00000000-0000-4000-8000-00000000p001",
    createdHoursAgo: 60,
    deadlineInHours: 20,
  }),
  build({
    id: DEMO_BET_IDS.verdictPosted,
    chatId: BOYS,
    creatorId: PRIYA,
    status: "verdict_posted",
    claim: "cook dinner every night this week, no ordering",
    stake: pts(15),
    participants: [side(PRIYA, "for", 170), side(MATT, "against", 168)],
    proofCriteria: criteria("a photo of each plate, seven nights", ["seven distinct meals", "kitchen visible in frame"], ["photo"]),
    judgeKind: "bot",
    lockedAt: at(-168),
    challengeToken: "mango-08",
    latestProofId: "00000000-0000-4000-8000-00000000p002",
    verdict: { outcome: "for", confidence: 0.91, pass: 1, proofId: "00000000-0000-4000-8000-00000000p002" },
    disputeWindowEndsAt: at(20),
    createdHoursAgo: 170,
    deadlineInHours: -4,
  }),
  build({
    id: DEMO_BET_IDS.disputed,
    chatId: BOYS,
    creatorId: JAKE,
    status: "disputed",
    claim: "in bed by 1am every night this week",
    stake: pts(10),
    participants: [side(JAKE, "for", 200), side(MATT, "against", 199)],
    proofCriteria: criteria("screen time screenshot each morning", ["seven mornings", "last pickup before 1:00 am"], ["photo"]),
    judgeKind: "bot",
    lockedAt: at(-199),
    challengeToken: "koala-63",
    latestProofId: "00000000-0000-4000-8000-00000000p003",
    verdict: { outcome: "for", confidence: 0.72, pass: 1, proofId: "00000000-0000-4000-8000-00000000p003" },
    disputeWindowEndsAt: at(6),
    dispute: { id: "00000000-0000-4000-8000-00000000d001", disputerId: MATT, challenged: "for", reason: "thursday screenshot is from the wrong week", openedAt: at(-3) },
    createdHoursAgo: 200,
    deadlineInHours: -30,
  }),
  build({
    id: DEMO_BET_IDS.won,
    chatId: BOYS,
    creatorId: MATT,
    status: "settled",
    claim: "beat jake in a 1v1 to 11",
    stake: pts(25),
    participants: [side(MATT, "for", 100), side(JAKE, "against", 99), side(DEV, "against", 98)],
    proofCriteria: criteria("video of the final point with the score called out", ["final point on camera", "score audible or shown"], ["video"]),
    judgeKind: "bot",
    lockedAt: at(-99),
    challengeToken: "falcon-21",
    latestProofId: "00000000-0000-4000-8000-00000000p004",
    verdict: { outcome: "for", confidence: 0.94, pass: 1, proofId: "00000000-0000-4000-8000-00000000p004" },
    disputeWindowEndsAt: at(-48),
    resolvedAt: at(-48),
    createdHoursAgo: 100,
    deadlineInHours: -72,
  }),
  build({
    id: DEMO_BET_IDS.lost,
    chatId: GYM,
    creatorId: MATT,
    status: "settled",
    claim: "read 30 pages a day for a week",
    stake: pts(10),
    participants: [side(MATT, "for", 300), side(PRIYA, "against", 299)],
    proofCriteria: criteria("photo of the page number each night", ["seven photos", "page count advances by 30+"], ["photo"]),
    judgeKind: "bot",
    lockedAt: at(-299),
    challengeToken: "pine-77",
    latestProofId: "00000000-0000-4000-8000-00000000p005",
    verdict: { outcome: "against", confidence: 0.88, pass: 1, proofId: "00000000-0000-4000-8000-00000000p005" },
    disputeWindowEndsAt: at(-120),
    resolvedAt: at(-120),
    createdHoursAgo: 300,
    deadlineInHours: -150,
  }),
  build({
    id: DEMO_BET_IDS.expired,
    chatId: BOYS,
    creatorId: SAM,
    status: "expired",
    claim: "wake up before 8 every day",
    stake: { kind: "social", amount: 0n, currency: "PTS", description: "loser buys coffee" },
    participants: [side(SAM, "for", 400), side(MATT, "against")],
    proofCriteria: criteria("alarm screenshot each morning", ["seven mornings before 8:00"], ["photo"]),
    judgeKind: "bot",
    createdHoursAgo: 400,
    deadlineInHours: -370,
  }),
];

export const DEMO_PROOFS: Record<string, ProofView[]> = {
  [DEMO_BET_IDS.proofSubmitted]: [
    { id: "00000000-0000-4000-8000-00000000p001", mediaUrl: "/demo/proof-1.svg", mime: "image/svg+xml", receivedAt: at(-1), status: "accepted", submitterName: "Sam" },
    { id: "00000000-0000-4000-8000-00000000p011", mediaUrl: "/demo/proof-2.svg", mime: "image/svg+xml", receivedAt: at(-0.5), status: "accepted", submitterName: "Sam" },
  ],
  [DEMO_BET_IDS.verdictPosted]: [{ id: "00000000-0000-4000-8000-00000000p002", mediaUrl: "/demo/proof-3.svg", mime: "image/svg+xml", receivedAt: at(-5), status: "judged", submitterName: "Priya" }],
  [DEMO_BET_IDS.disputed]: [{ id: "00000000-0000-4000-8000-00000000p003", mediaUrl: "/demo/proof-2.svg", mime: "image/svg+xml", receivedAt: at(-28), status: "judged", submitterName: "Jake" }],
  [DEMO_BET_IDS.won]: [{ id: "00000000-0000-4000-8000-00000000p004", mediaUrl: "/demo/proof-1.svg", mime: "video/mp4", receivedAt: at(-73), status: "judged", submitterName: "Matt" }],
  [DEMO_BET_IDS.lost]: [{ id: "00000000-0000-4000-8000-00000000p005", mediaUrl: "/demo/proof-3.svg", mime: "image/svg+xml", receivedAt: at(-150), status: "judged", submitterName: "Matt" }],
};

const checks = (...c: Array<[string, boolean, string]>): CriterionCheck[] => c.map(([criterion, met, evidence]) => ({ criterion, met, evidence }));

export const DEMO_VERDICTS: Record<string, VerdictView> = {
  [DEMO_BET_IDS.verdictPosted]: {
    outcome: "for",
    confidence: 0.91,
    pass: 1,
    createdAt: at(-4),
    reasoning: "Seven plates, seven different nights, kitchen tiles visible in six of them. Token mango-08 written on a sticky note in frame.",
    checks: checks(["seven distinct meals", true, "7 photos, no duplicates by hash"], ["kitchen visible in frame", true, "counter and stove in 6 of 7"], ["challenge token mango-08", true, "sticky note, night 1"]),
  },
  [DEMO_BET_IDS.disputed]: {
    outcome: "for",
    confidence: 0.72,
    pass: 1,
    createdAt: at(-29),
    reasoning: "Six of seven mornings show last pickup before 1:00 am. Thursday's screenshot is cropped and the date is not fully visible.",
    checks: checks(["seven mornings", true, "7 screenshots received"], ["last pickup before 1:00 am", false, "thursday date cropped"], ["challenge token koala-63", true, "visible in notes app"]),
  },
  [DEMO_BET_IDS.won]: {
    outcome: "for",
    confidence: 0.94,
    pass: 1,
    createdAt: at(-72),
    reasoning: "Final point lands at 0:41, Matt calls 11–8 on camera, Jake nods. Token falcon-21 said out loud at the start.",
    checks: checks(["final point on camera", true, "0:41, clean make"], ["score audible or shown", true, "11–8 called out"], ["challenge token falcon-21", true, "spoken at 0:02"]),
  },
  [DEMO_BET_IDS.lost]: {
    outcome: "against",
    confidence: 0.88,
    pass: 1,
    createdAt: at(-149),
    reasoning: "Five photos, not seven. Page numbers advance 30+ on the nights covered, but two nights are missing.",
    checks: checks(["seven photos", false, "5 received"], ["page count advances by 30+", true, "34, 31, 40, 30, 33"], ["challenge token pine-77", true, "written on bookmark"]),
  },
};

const TRAILS: Record<string, Array<[BetStatus, string, number]>> = {
  [DEMO_BET_IDS.proposed]: [["proposed", "propose", -2]],
  [DEMO_BET_IDS.locked]: [["proposed", "propose", -30], ["locked", "accept", -29]],
  [DEMO_BET_IDS.proofSubmitted]: [["proposed", "propose", -60], ["locked", "accept", -58], ["proof_submitted", "proof_received", -1]],
  [DEMO_BET_IDS.verdictPosted]: [["proposed", "propose", -170], ["locked", "accept", -168], ["proof_submitted", "proof_received", -5], ["judging", "judge_start", -4.5], ["verdict_posted", "verdict", -4]],
  [DEMO_BET_IDS.disputed]: [["proposed", "propose", -200], ["locked", "accept", -199], ["proof_submitted", "proof_received", -28], ["judging", "judge_start", -27], ["verdict_posted", "verdict", -26], ["disputed", "dispute", -3]],
  [DEMO_BET_IDS.won]: [["proposed", "propose", -100], ["locked", "accept", -98], ["proof_submitted", "proof_received", -73], ["judging", "judge_start", -72.5], ["verdict_posted", "verdict", -72], ["settled", "settle", -48]],
  [DEMO_BET_IDS.lost]: [["proposed", "propose", -300], ["locked", "accept", -299], ["proof_submitted", "proof_received", -150], ["judging", "judge_start", -149.5], ["verdict_posted", "verdict", -149], ["settled", "settle", -120]],
  [DEMO_BET_IDS.expired]: [["proposed", "propose", -400], ["expired", "accept_timeout", -376]],
};

export function demoEvents(betId: string): EventView[] {
  return (TRAILS[betId] ?? []).map(([toStatus, type, h], i) => ({ version: i + 1, toStatus, type, createdAt: at(h) }));
}

export const DEMO_NAMES = new Map<string, string>(DEMO_USERS.map((u) => [u.id, u.name]));
