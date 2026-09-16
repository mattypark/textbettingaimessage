import type { SupabaseClient } from "@supabase/supabase-js";
import { VersionConflict, type BetStore, type TransitionRecord } from "./store";
import type { Bet } from "./types";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/** bigint survives the jsonb round-trip as a string. */
function serialize(bet: Bet): Record<string, unknown> {
  return { ...bet, stake: { ...bet.stake, amount: bet.stake.amount.toString() } };
}

function deserialize(state: Record<string, unknown>): Bet {
  const stake = state.stake as { amount: string | number | bigint; kind: Bet["stake"]["kind"]; currency: string; description?: string };
  return { ...(state as unknown as Bet), stake: { ...stake, amount: BigInt(stake.amount) } };
}

const OPEN = ["proposed", "locked", "proof_submitted", "judging", "verdict_posted", "disputed"];

/** BetStore on Supabase. The `state` column is the document; columns mirror what needs indexing. */
export class SupabaseBetStore implements BetStore {
  constructor(private readonly db: SupabaseClient) {}

  async create(bet: Bet): Promise<Bet> {
    const { error } = await this.db.from("bets").insert({
      id: bet.id,
      chat_id: bet.chatId,
      creator_id: bet.creatorId,
      status: bet.status,
      claim: bet.claim,
      stake_kind: bet.stake.kind,
      stake_amount: bet.stake.amount.toString(),
      stake_currency: bet.stake.currency,
      stake_description: bet.stake.description ?? null,
      deadline_at: bet.deadlineAt,
      accept_by_at: bet.acceptByAt,
      proof_grace_hours: bet.proofGraceHours,
      no_proof_rule: bet.noProofRule,
      judge_kind: bet.judgeKind,
      referee_user_id: bet.refereeUserId ?? null,
      state: serialize(bet),
      version: bet.version,
    });
    if (error) fail("bets.insert", error);

    const { error: pError } = await this.db.from("bet_participants").insert(
      bet.participants.map((p) => ({
        bet_id: bet.id,
        user_id: p.userId,
        side: p.side,
        required: p.required,
        accepted_at: p.acceptedAt ?? null,
        accept_source: p.userId === bet.creatorId ? "creator" : null,
      }))
    );
    if (pError) fail("bet_participants.insert", pError);
    return bet;
  }

  async get(betId: string): Promise<Bet | null> {
    const { data, error } = await this.db.from("bets").select("state").eq("id", betId).maybeSingle();
    if (error) fail("bets.get", error);
    return data ? deserialize(data.state as Record<string, unknown>) : null;
  }

  async applyTransition(expectedVersion: number, next: Bet, record: Omit<TransitionRecord, "version">): Promise<void> {
    const { data, error } = await this.db.rpc("apply_bet_transition", {
      p_bet_id: next.id,
      p_expected_version: expectedVersion,
      p_next_state: serialize(next),
      p_event: record.event,
      p_effects: JSON.parse(JSON.stringify(record.effects, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
      p_actor_user_id: "userId" in record.event ? record.event.userId : null,
      p_provider_message_id: null,
    });
    if (error) fail("apply_bet_transition", error);
    if (data !== true) throw new VersionConflict(next.id);
  }

  async markEffectsDone(betId: string, version: number): Promise<void> {
    const { error } = await this.db
      .from("bet_events")
      .update({ effects_completed_at: new Date().toISOString() })
      .eq("bet_id", betId)
      .eq("version", version);
    if (error) fail("bet_events.markEffectsDone", error);
  }

  async setChallengeToken(betId: string, token: string): Promise<void> {
    const bet = await this.get(betId);
    if (!bet) return;
    const { error } = await this.db
      .from("bets")
      .update({ challenge_token: token, state: serialize({ ...bet, challengeToken: token }) })
      .eq("id", betId);
    if (error) fail("bets.setChallengeToken", error);
  }

  async setCardMessageId(betId: string, providerMessageId: string): Promise<void> {
    const bet = await this.get(betId);
    if (!bet) return;
    const { error } = await this.db
      .from("bets")
      .update({ card_provider_message_id: providerMessageId, state: serialize({ ...bet, cardProviderMessageId: providerMessageId }) })
      .eq("id", betId);
    if (error) fail("bets.setCardMessageId", error);
  }

  async findByCard(chatId: string, providerMessageId: string | ""): Promise<Bet | null> {
    const query = this.db.from("bets").select("state").eq("chat_id", chatId);
    const { data, error } = providerMessageId
      ? await query.eq("card_provider_message_id", providerMessageId).maybeSingle()
      : await query.eq("status", "proposed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) fail("bets.findByCard", error);
    return data ? deserialize(data.state as Record<string, unknown>) : null;
  }

  async openBetsInChat(chatId: string): Promise<Bet[]> {
    const { data, error } = await this.db.from("bets").select("state").eq("chat_id", chatId).in("status", OPEN);
    if (error) fail("bets.openBetsInChat", error);
    return (data ?? []).map((row) => deserialize(row.state as Record<string, unknown>));
  }

  async betsWithPendingTimeouts(limit: number): Promise<Bet[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from("bets")
      .select("state")
      .or(`and(status.eq.proposed,accept_by_at.lt.${now}),and(status.eq.locked,deadline_at.lt.${now}),and(status.eq.verdict_posted,dispute_window_ends_at.lt.${now}),and(status.eq.disputed,judge_kind.eq.referee)`)
      .limit(limit);
    if (error) fail("bets.betsWithPendingTimeouts", error);
    return (data ?? []).map((row) => deserialize(row.state as Record<string, unknown>));
  }

  async incompleteTransitions(limit: number): Promise<Array<TransitionRecord & { bet: Bet }>> {
    const { data, error } = await this.db
      .from("bet_events")
      .select("bet_id, version, from_status, to_status, event, effects, bets(state)")
      .is("effects_completed_at", null)
      .lt("created_at", new Date(Date.now() - 60_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) fail("bet_events.incomplete", error);
    return (data ?? []).map((row) => {
      const bets = row.bets as unknown as { state: Record<string, unknown> } | { state: Record<string, unknown> }[] | null;
      const state = Array.isArray(bets) ? bets[0]?.state : bets?.state;
      return {
        betId: row.bet_id,
        version: row.version,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        event: row.event,
        effects: JSON.parse(JSON.stringify(row.effects), (k, v) => (k === "amount" && typeof v === "string" ? BigInt(v) : v)),
        bet: deserialize(state ?? {}),
      };
    });
  }

  async addHonor(userId: string, betId: string, delta: number, reason: string): Promise<void> {
    const { error } = await this.db.from("honor_events").insert({ user_id: userId, bet_id: betId, delta, reason });
    if (error) fail("honor_events.insert", error);
    const { error: uError } = await this.db.rpc("bump_honor", { p_user_id: userId, p_delta: delta });
    if (uError) fail("bump_honor", uError);
  }

  async enqueueJudge(betId: string, proofId: string, pass: 1 | 2, reason?: string): Promise<void> {
    const { error } = await this.db.from("jobs").insert({ kind: "judge", payload: { betId, proofId, pass, ...(reason ? { disputeReason: reason } : {}) } });
    if (error) fail("jobs.insert", error);
  }
}
