/**
 * chat_leaderboard against Postgres, called as a signed-in member: settled
 * point bets rank the chat, balances come through, and a non-member sees
 * nothing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PointsLedger } from "@/src/ledger/points-ledger";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key && anon);
const uuid = () => crypto.randomUUID();

/** Creates an auth user + app user row and returns a client signed in as them. */
async function memberClient(admin: SupabaseClient, appUserId: string, phone: string) {
  const email = `${appUserId}@example.test`;
  const password = `pw-${uuid()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("users").update({ auth_user_id: data.user.id }).eq("id", appUserId);
  const client = createClient(url ?? "", anon ?? "", { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, authId: data.user.id, phone };
}

describe.skipIf(!enabled)("chat_leaderboard (Postgres)", () => {
  let admin: SupabaseClient;
  let chatId: string;
  const users = { matt: uuid(), jake: uuid(), outsider: uuid() };
  const authIds: string[] = [];
  let matt: SupabaseClient;
  let outsider: SupabaseClient;

  beforeAll(async () => {
    admin = createClient(url ?? "", key ?? "", { auth: { persistSession: false } });
    const ledger = new PointsLedger(admin);
    for (const [name, id] of Object.entries(users)) {
      await admin.from("users").insert({ id, phone: `+1555${Math.floor(Math.random() * 1e7)}`, display_name: name });
      await ledger.grant({ userId: id, amount: 100n, idem: `grant:${id}` });
    }
    const { data: chat } = await admin.from("chats").insert({ provider: "fake", provider_chat_id: uuid(), is_group: true }).select("id").single();
    chatId = chat!.id;
    for (const id of [users.matt, users.jake]) await admin.from("chat_members").insert({ chat_id: chatId, user_id: id, handle: id });

    // One settled 20-point bet Matt won.
    const betId = uuid();
    const state = {
      id: betId,
      chatId,
      creatorId: users.matt,
      status: "settled",
      claim: "leaderboard bet",
      stake: { kind: "points", amount: "20", currency: "PTS" },
      participants: [
        { userId: users.matt, side: "for", required: true },
        { userId: users.jake, side: "against", required: true },
      ],
      verdict: { outcome: "for", confidence: 0.9, pass: 1 },
      version: 5,
    };
    await admin.from("bets").insert({
      id: betId,
      chat_id: chatId,
      creator_id: users.matt,
      status: "settled",
      claim: state.claim,
      stake_kind: "points",
      stake_amount: 20,
      deadline_at: new Date().toISOString(),
      accept_by_at: new Date().toISOString(),
      state,
      version: 5,
    });

    const m = await memberClient(admin, users.matt, "");
    const o = await memberClient(admin, users.outsider, "");
    matt = m.client;
    outsider = o.client;
    authIds.push(m.authId, o.authId);
  });

  afterAll(async () => {
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
  });

  it("ranks members by net points and returns balances", async () => {
    const { data, error } = await matt.rpc("chat_leaderboard", { p_chat_id: chatId });
    expect(error).toBeNull();
    const rows = data as Array<{ user_id: string; net_points: number | string; wins: number; losses: number; available: number | string }>;
    expect(rows.map((r) => r.user_id)).toEqual([users.matt, users.jake]);
    expect(Number(rows[0].net_points)).toBe(20);
    expect(rows[0].wins).toBe(1);
    expect(Number(rows[1].net_points)).toBe(-20);
    expect(rows[1].losses).toBe(1);
    expect(Number(rows[0].available)).toBe(100);
  });

  it("returns nothing to a non-member", async () => {
    const { data, error } = await outsider.rpc("chat_leaderboard", { p_chat_id: chatId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
