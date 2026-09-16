import { randomUUID } from "node:crypto";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { betCard } from "@/src/bets/card";
import { parseDeadline } from "@/src/bets/commands";
import type { BetEngine } from "@/src/bets/engine";
import { IllegalTransition } from "@/src/bets/state-machine";
import type { BetStore } from "@/src/bets/store";
import { ACCEPT_WINDOW_HOURS, type Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
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

  const createBet = betaZodTool({
    name: "create_bet",
    description:
      "Create a bet from what the sender described and post its card to the chat. The sender is always on the 'for' side (they claim they'll do it, or that X will happen). Use against_user_ids when they named who they're betting; leave it empty for an open bet that anyone can take by reacting 👍.",
    inputSchema: z.object({
      claim: z.string().min(3).max(200).describe("The thing being bet on, first person from the sender's view, e.g. 'I make a half-court shot'"),
      stake_points: z.number().int().min(0).max(10_000).describe("Points each side puts up. 0 when the stake is social."),
      social_stake: z.string().max(80).optional().describe("A non-points forfeit like 'loser buys dinner'. Set stake_points to 0 when used."),
      deadline: z.string().describe("Natural language or ISO date: 'friday', 'tomorrow', 'in 3 days', '2026-10-01'"),
      proof_summary: z.string().max(160).describe("One line: what the proof photo/video must show"),
      proof_required: z.array(z.string().max(120)).min(1).max(5).describe("Concrete, checkable criteria the judge will tick off"),
      against_user_ids: z.array(z.string()).max(10).default([]).describe("user_ids from the members list who take the other side"),
      referee_user_id: z.string().optional().describe("A non-participant member who judges instead of the bot"),
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
        version: 0,
      };
      await betStore.create(bet);
      session.replies.push({ text: betCard(bet, names), replyToProviderMessageId: ctx.event.providerMessageId, idempotencyKey: `card:${bet.id}` });
      return `card posted for bet ${bet.id}. ${against.length ? `waiting on ${against.map(names).join(", ")} to 👍` : "open — first 👍 from someone else takes the other side"}. Reply with one short line or nothing.`;
    },
  });

  const acceptBet = betaZodTool({
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

  const declineBet = betaZodTool({
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

  const getBalance = betaZodTool({
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

  const leaderboard = betaZodTool({
    name: "leaderboard",
    description: "Points and honor for everyone in this chat, richest first.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await Promise.all(snap.members.map(async (m) => ({ name: displayName(m), wallet: await ledger.wallet(m.id), honor: m.honorScore })));
      rows.sort((a, b) => Number(b.wallet.available + b.wallet.held - (a.wallet.available + a.wallet.held)));
      return rows.map((r, i) => `${i + 1}. ${r.name} — ${r.wallet.available + r.wallet.held} pts (honor ${r.honor})`).join("\n") || "nobody here yet";
    },
  });

  const explainTerms = betaZodTool({
    name: "explain_terms",
    description: "The rules / terms, for when someone asks how it works or what they agreed to.",
    inputSchema: z.object({}),
    run: async () => `terms v${TERMS_VERSION} (${termsUrl(deps.siteUrl)}):\n${TERMS_SUMMARY.join("\n")}`,
  });

  const setName = betaZodTool({
    name: "set_name",
    description: "Remember what to call the sender ('call me Matt').",
    inputSchema: z.object({ name: z.string().min(1).max(30) }),
    run: async ({ name }) => {
      await store.setDisplayName(ctx.userId, name.trim());
      return `ok, ${name.trim()}`;
    },
  });

  return [createBet, acceptBet, declineBet, getBalance, leaderboard, explainTerms, setName];
}
