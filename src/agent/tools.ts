import { randomUUID } from "node:crypto";
import { z } from "zod";
import { betCard } from "@/src/bets/card";
import { disputeBet, refereeDecide } from "@/src/bets/decisions";
import { parseDeadline } from "@/src/bets/commands";
import type { BetEngine } from "@/src/bets/engine";
import { IllegalTransition } from "@/src/bets/state-machine";
import type { BetStore } from "@/src/bets/store";
import { ACCEPT_WINDOW_HOURS, type Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
import { tool } from "@/src/model/types";
import { fundedBetFor } from "@/src/settle/funded-bet";
import { fundingStatusText } from "@/src/settle/funding";
import { dollarAmount, PAY_PROVIDERS, PROVIDER_LABEL } from "@/src/settle/pay-links";
import type { Ledger } from "@/src/ledger/types";
import { TERMS_SUMMARY, TERMS_VERSION, termsUrl } from "@/src/onboarding/terms";
import { TermsGate } from "@/src/onboarding/gate";
import type { OutboundMessage } from "@/src/transport/types";
import { displayName, type ChatSnapshot } from "./context";
import type { TurnContext } from "@/src/inbound/pipeline";

export interface ToolDeps {
  store: Store;
  betStore: BetStore;
  engine: BetEngine;
  ledger: Ledger;
  siteUrl: string;
  clock?: () => Date;
}

/** Everything a turn's tools need, plus the side channel for messages that must carry an idempotency key (cards). */
export interface ToolSession {
  ctx: TurnContext;
  snap: ChatSnapshot;
  replies: OutboundMessage[];
}

function explain(error: unknown): string {
  if (error instanceof IllegalTransition) return `not possible: ${error.message}`;
  return `error: ${error instanceof Error ? error.message : String(error)}`;
}

export function buildTools(deps: ToolDeps, session: ToolSession) {
  const { store, betStore, engine, ledger, clock = () => new Date() } = deps;
  const { ctx, snap } = session;
  const names = (id: string) => displayName(snap.members.find((m) => m.id === id) ?? { displayName: null, phone: id });
  const gate = new TermsGate(store, deps.siteUrl);
  const termsBlock = async () => ((await gate.accepted(ctx.userId)) ? null : `blocked: ${gate.needsTermsMessage(names(ctx.userId))}`);

  const createBet = tool({
    name: "create_bet",
    description:
      "Create a bet from what the sender described and post its card to the chat. The sender is always on the 'for' side (they claim they'll do it, or that X will happen). Use against_user_ids when they named who they're betting; leave it empty for an open bet that anyone can take by reacting 👍.",
    inputSchema: z.object({
      claim: z.string().min(3).max(200).describe("The thing being bet on, first person from the sender's view, e.g. 'I make a half-court shot'"),
      stake_points: z.number().int().min(0).max(10_000).describe("Points each side puts up. 0 when the stake is social."),
      social_stake: z.string().max(80).optional().describe("A non-points forfeit like 'loser buys dinner'. Set stake_points to 0 when used."),
      deadline: z.string().describe("A day, not a time: 'friday', 'tomorrow', 'in 3 days', 'next week', or 'YYYY-MM-DD'. Deadlines are always end of that day."),
      proof_summary: z.string().max(160).describe("One line: what the proof photo/video must show"),
      proof_required: z.array(z.string().max(120)).min(1).max(5).describe("Concrete, checkable criteria the judge will tick off"),
      against_user_ids: z.array(z.string()).max(10).default([]).describe("user_ids from the members list who take the other side"),
      referee_user_id: z.string().optional().describe("A non-participant member who judges instead of the bot"),
      holder_user_id: z.string().optional().describe("Real-money social stake only: the member (not in the bet) who holds the cash. Each bettor pays them up front; they pay the winner."),
      no_proof_rule: z.enum(["auto_loss", "void"]).default("auto_loss"),
    }),
    run: async (input) => {
      const blocked = await termsBlock();
      if (blocked) return blocked;
      const now = clock();
      const deadlineAt = parseDeadline(input.deadline, now);
      if (!deadlineAt) return `couldn't read the deadline "${input.deadline}" — ask for a day or date`;
      if (deadlineAt.getTime() < now.getTime() + 15 * 60_000) return "deadline is in the past or too soon (needs 15+ minutes)";
      const against = input.against_user_ids.filter((id) => id !== ctx.userId && snap.members.some((m) => m.id === id));
      const stake: Bet["stake"] = input.social_stake
        ? { kind: "social", amount: 0n, currency: "PTS", description: input.social_stake }
        : { kind: "points", amount: BigInt(input.stake_points), currency: "PTS" };
      const dollars = stake.kind === "social" ? dollarAmount(stake.description ?? "") : null;
      const holderOk = input.holder_user_id && input.holder_user_id !== ctx.userId && !against.includes(input.holder_user_id) && snap.members.some((m) => m.id === input.holder_user_id);
      if (input.holder_user_id && !holderOk) return "the holder has to be someone in the chat who is not in the bet";
      const funding: Bet["funding"] = dollars !== null && holderOk ? { holderUserId: input.holder_user_id!, amountUsd: dollars, paid: {} } : undefined;
      if (stake.kind === "points" && stake.amount > snap.wallet.available) {
        return `sender only has ${snap.wallet.available} pts available; suggest a smaller stake`;
      }
      const bet: Bet = {
        id: randomUUID(),
        chatId: ctx.chatId,
        creatorId: ctx.userId,
        status: "proposed",
        claim: input.claim,
        stake,
        participants: [
          { userId: ctx.userId, side: "for", required: true, acceptedAt: now.toISOString() },
          ...against.map((userId) => ({ userId, side: "against" as const, required: true })),
        ],
        proofCriteria: { summary: input.proof_summary, required: input.proof_required, optional: [], challengeTokenRequired: true, mediaKinds: ["photo", "video"] },
        judgeKind: input.referee_user_id ? "referee" : "bot",
        refereeUserId: input.referee_user_id,
        open: against.length === 0,
        createdAt: now.toISOString(),
        acceptByAt: new Date(now.getTime() + ACCEPT_WINDOW_HOURS * 3_600_000).toISOString(),
        deadlineAt: deadlineAt.toISOString(),
        proofGraceHours: 12,
        noProofRule: input.no_proof_rule,
        ...(funding ? { funding } : {}),
        version: 0,
      };
      await betStore.create(bet);
      session.replies.push({ text: betCard(bet, names), replyToProviderMessageId: ctx.event.providerMessageId, idempotencyKey: `card:${bet.id}` });
      return `card posted for bet ${bet.id}. ${against.length ? `waiting on ${against.map(names).join(", ")} to 👍` : "open — first 👍 from someone else takes the other side"}. Reply with one short line or nothing.`;
    },
  });

  const acceptBet = tool({
    name: "accept_bet",
    description: "The sender accepts an open or pending bet in this chat (they said 'I'm in', 'bet', 'deal', etc.). Use the bet id from the open bets list.",
    inputSchema: z.object({ bet_id: z.string() }),
    run: async ({ bet_id }) => {
      const blocked = await termsBlock();
      if (blocked) return blocked;
      const bet = await betStore.get(bet_id);
      if (!bet || bet.chatId !== ctx.chatId) return "no such bet in this chat";
      const isParticipant = bet.participants.some((p) => p.userId === ctx.userId);
      try {
        const next = await engine.apply(bet.id, isParticipant ? { type: "ACCEPT", userId: ctx.userId } : { type: "JOIN", userId: ctx.userId, side: "against" });
        return next.status === "locked" ? "accepted — bet is now locked and stakes are held (card already posted)" : "accepted — still waiting on others";
      } catch (error) {
        return explain(error);
      }
    },
  });

  const declineBet = tool({
    name: "decline_bet",
    description: "The sender declines a bet they were named in, or the creator cancels their own proposed bet.",
    inputSchema: z.object({ bet_id: z.string() }),
    run: async ({ bet_id }) => {
      const bet = await betStore.get(bet_id);
      if (!bet || bet.chatId !== ctx.chatId) return "no such bet in this chat";
      try {
        await engine.apply(bet.id, bet.creatorId === ctx.userId ? { type: "CANCEL", userId: ctx.userId } : { type: "DECLINE", userId: ctx.userId });
        return "done (a message was posted)";
      } catch (error) {
        return explain(error);
      }
    },
  });

  const getBalance = tool({
    name: "get_balance",
    description: "Points balance and honor score for the sender or a named member.",
    inputSchema: z.object({ user_id: z.string().optional() }),
    run: async ({ user_id }) => {
      const id = user_id ?? ctx.userId;
      const wallet = await ledger.wallet(id);
      const member = snap.members.find((m) => m.id === id);
      return `${names(id)}: ${wallet.available} pts available, ${wallet.held} held, honor ${member?.honorScore ?? "?"}`;
    },
  });

  const leaderboard = tool({
    name: "leaderboard",
    description: "Points and honor for everyone in this chat, richest first.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await Promise.all(snap.members.map(async (m) => ({ name: displayName(m), wallet: await ledger.wallet(m.id), honor: m.honorScore })));
      rows.sort((a, b) => Number(b.wallet.available + b.wallet.held - (a.wallet.available + a.wallet.held)));
      return rows.map((r, i) => `${i + 1}. ${r.name} — ${r.wallet.available + r.wallet.held} pts (honor ${r.honor})`).join("\n") || "nobody here yet";
    },
  });

  const explainTerms = tool({
    name: "explain_terms",
    description: "The rules / terms, for when someone asks how it works or what they agreed to.",
    inputSchema: z.object({}),
    run: async () => `terms v${TERMS_VERSION} (${termsUrl(deps.siteUrl)}):\n${TERMS_SUMMARY.join("\n")}`,
  });

  const setName = tool({
    name: "set_name",
    description: "Remember what to call the sender ('call me Matt').",
    inputSchema: z.object({ name: z.string().min(1).max(30) }),
    run: async ({ name }) => {
      await store.setDisplayName(ctx.userId, name.trim());
      return `ok, ${name.trim()}`;
    },
  });

  const setPayHandle = tool({
    name: "set_pay_handle",
    description: "Remember where the sender wants to be paid when a social stake settles ('my venmo is @matt'). Mushy only posts a link that opens the payer's own app; it never holds money.",
    inputSchema: z.object({ provider: z.enum(PAY_PROVIDERS), handle: z.string().min(2).max(40).describe("Username, $cashtag, PayPal.me name, or phone for Apple Cash — without the @ or $") }),
    run: async ({ provider, handle }) => {
      const clean = handle.replace(/^[@$]/, "");
      await store.setPayHandle(ctx.userId, provider, clean);
      return `saved: ${PROVIDER_LABEL[provider]} ${clean}`;
    },
  });

  const markPaid = tool({
    name: "mark_paid",
    description: "The sender says they sent their stake to the holder of a funded bet ('paid', 'sent it', 'venmo'd sam'). Records it and returns the tally.",
    inputSchema: z.object({ bet_id: z.string().optional().describe("Omit when there is only one funded bet waiting on the sender") }),
    run: async ({ bet_id }) => {
      const bet = await fundedBetFor(betStore, ctx.chatId, ctx.userId, bet_id, "bettor");
      if (typeof bet === "string") return bet;
      const funding = { ...bet.funding!, paid: { ...bet.funding!.paid, [ctx.userId]: clock().toISOString() } };
      await betStore.setFunding(bet.id, funding);
      return fundingStatusText({ ...bet, funding }, names);
    },
  });

  const confirmPot = tool({
    name: "confirm_pot",
    description: "The holder of a funded bet says the pot is full ('got it', 'all in', 'received'). Only the holder can do this.",
    inputSchema: z.object({ bet_id: z.string().optional() }),
    run: async ({ bet_id }) => {
      const bet = await fundedBetFor(betStore, ctx.chatId, ctx.userId, bet_id, "holder");
      if (typeof bet === "string") return bet;
      const funding = { ...bet.funding!, confirmedAt: clock().toISOString() };
      await betStore.setFunding(bet.id, funding);
      return fundingStatusText({ ...bet, funding }, names);
    },
  });

  const dispute = tool({
    name: "dispute_bet",
    description: "The sender disputes a posted verdict on a bet they lost. Costs a points bond that is forfeited if the verdict stands. Include their stated reason.",
    inputSchema: z.object({ bet_id: z.string(), reason: z.string().max(300).optional() }),
    run: async ({ bet_id, reason }) => (await disputeBet(betStore, engine, bet_id, ctx.userId, reason)).text,
  });

  const refereeCall = tool({
    name: "referee_decide",
    description: "The sender is the named referee of a bet and is calling it: claim_stands=true means the 'for' side wins.",
    inputSchema: z.object({ bet_id: z.string(), claim_stands: z.boolean() }),
    run: async ({ bet_id, claim_stands }) => (await refereeDecide(betStore, engine, bet_id, ctx.userId, claim_stands)).text,
  });

  return [createBet, acceptBet, declineBet, markPaid, confirmPot, dispute, refereeCall, getBalance, leaderboard, explainTerms, setName, setPayHandle];
}
