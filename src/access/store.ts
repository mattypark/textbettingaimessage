import type { SupabaseClient } from "@supabase/supabase-js";

export type AccessLevel = "waitlist" | "active";

export interface InviteView {
  code: string;
  maxUses: number;
  uses: number;
}

export interface WaitlistResult {
  referralCode: string;
  rank: number;
  activated: boolean;
}

export class AccessError extends Error {
  constructor(message: string, readonly code: "invalid" | "used_up" | "unknown") {
    super(message);
    this.name = "AccessError";
  }
}

export interface AccessStore {
  access(userId: string): Promise<AccessLevel>;
  accessByPhone(phone: string): Promise<AccessLevel>;
  /** True when any of these users is activated (chat-level unlock). */
  anyActive(userIds: string[]): Promise<boolean>;
  /** Redeems an invite for a phone; returns the new member's own invite code. */
  redeemInvite(code: string, phone: string): Promise<string>;
  joinWaitlist(phone: string, referredBy?: string): Promise<WaitlistResult>;
  myInvite(userId: string): Promise<InviteView | null>;
  /** The member's own code, minted on first ask (chat-unlocked members have none until they ask). */
  ensureInvite(userId: string): Promise<InviteView>;
  /** Promote waitlisters with enough referrals. Returns how many. */
  promote(threshold?: number): Promise<number>;
  /** Seed/admin: mint a code with no owner. */
  mint(code: string, maxUses: number): Promise<void>;
}

const randomCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export class MemoryAccessStore implements AccessStore {
  readonly users = new Map<string, { phone: string; access: AccessLevel }>(); // by userId
  readonly invites = new Map<string, { owner?: string; maxUses: number; uses: number; redeemed: Set<string> }>();
  readonly waitlist: Array<{ phone: string; referralCode: string; referredBy?: string; referrals: number; activated: boolean }> = [];
  /** phone → userId, filled by the caller's user store. */
  readonly phoneToUser = new Map<string, string>();

  registerUser(userId: string, phone: string, access: AccessLevel = "waitlist") {
    this.users.set(userId, { phone, access });
    this.phoneToUser.set(phone, userId);
  }

  async access(userId: string): Promise<AccessLevel> {
    return this.users.get(userId)?.access ?? "waitlist";
  }

  async accessByPhone(phone: string): Promise<AccessLevel> {
    const id = this.phoneToUser.get(phone);
    return id ? this.access(id) : "waitlist";
  }

  async anyActive(userIds: string[]): Promise<boolean> {
    for (const id of userIds) if ((await this.access(id)) === "active") return true;
    return false;
  }

  private activate(phone: string): string {
    let userId = this.phoneToUser.get(phone);
    if (!userId) {
      userId = `user-${phone}`;
      this.registerUser(userId, phone);
    }
    this.users.get(userId)!.access = "active";
    const entry = this.waitlist.find((w) => w.phone === phone);
    if (entry) entry.activated = true;
    let own = [...this.invites.entries()].find(([, v]) => v.owner === userId)?.[0];
    if (!own) {
      own = randomCode();
      this.invites.set(own, { owner: userId, maxUses: 3, uses: 0, redeemed: new Set() });
    }
    return own;
  }

  async redeemInvite(code: string, phone: string): Promise<string> {
    const invite = this.invites.get(code.toUpperCase());
    if (!invite) throw new AccessError("invalid invite code", "invalid");
    if (!invite.redeemed.has(phone)) {
      if (invite.uses >= invite.maxUses) throw new AccessError("invite code is used up", "used_up");
      invite.uses += 1;
      invite.redeemed.add(phone);
    }
    return this.activate(phone);
  }

  async joinWaitlist(phone: string, referredBy?: string): Promise<WaitlistResult> {
    let entry = this.waitlist.find((w) => w.phone === phone);
    if (!entry) {
      entry = { phone, referralCode: randomCode(), referredBy: referredBy?.toUpperCase(), referrals: 0, activated: false };
      this.waitlist.push(entry);
      const referrer = referredBy && this.waitlist.find((w) => w.referralCode === referredBy.toUpperCase() && w.phone !== phone);
      if (referrer) referrer.referrals += 1;
    }
    const score = (w: (typeof this.waitlist)[number]) => this.waitlist.indexOf(w) - 300 * w.referrals;
    const rank = entry.activated ? 0 : this.waitlist.filter((w) => !w.activated && score(w) < score(entry!)).length + 1;
    return { referralCode: entry.referralCode, rank, activated: (await this.accessByPhone(phone)) === "active" };
  }

  async myInvite(userId: string): Promise<InviteView | null> {
    const found = [...this.invites.entries()].find(([, v]) => v.owner === userId);
    return found ? { code: found[0], maxUses: found[1].maxUses, uses: found[1].uses } : null;
  }

  async ensureInvite(userId: string): Promise<InviteView> {
    const existing = await this.myInvite(userId);
    if (existing) return existing;
    const code = randomCode();
    this.invites.set(code, { owner: userId, maxUses: 3, uses: 0, redeemed: new Set() });
    return { code, maxUses: 3, uses: 0 };
  }

  async promote(threshold = 3): Promise<number> {
    const due = this.waitlist.filter((w) => !w.activated && w.referrals >= threshold);
    for (const w of due) this.activate(w.phone);
    return due.length;
  }

  async mint(code: string, maxUses: number): Promise<void> {
    this.invites.set(code.toUpperCase(), { maxUses, uses: 0, redeemed: new Set() });
  }
}

function fail(context: string, error: { message: string; code?: string } | null): never {
  if (error?.code === "P0001") throw new AccessError("invalid invite code", "invalid");
  if (error?.code === "P0002") throw new AccessError("invite code is used up", "used_up");
  throw new AccessError(`${context}: ${error?.message ?? "unknown error"}`, "unknown");
}

export class SupabaseAccessStore implements AccessStore {
  constructor(private readonly db: SupabaseClient) {}

  async access(userId: string): Promise<AccessLevel> {
    const { data, error } = await this.db.from("users").select("access").eq("id", userId).maybeSingle();
    if (error) fail("access", error);
    return (data?.access as AccessLevel) ?? "waitlist";
  }

  async accessByPhone(phone: string): Promise<AccessLevel> {
    const { data, error } = await this.db.from("users").select("access").eq("phone", phone).maybeSingle();
    if (error) fail("accessByPhone", error);
    return (data?.access as AccessLevel) ?? "waitlist";
  }

  async anyActive(userIds: string[]): Promise<boolean> {
    if (!userIds.length) return false;
    const { count, error } = await this.db.from("users").select("id", { count: "exact", head: true }).in("id", userIds).eq("access", "active");
    if (error) fail("anyActive", error);
    return (count ?? 0) > 0;
  }

  async redeemInvite(code: string, phone: string): Promise<string> {
    const { data, error } = await this.db.rpc("redeem_invite", { p_code: code, p_phone: phone });
    if (error) fail("redeem_invite", error);
    return data as string;
  }

  async joinWaitlist(phone: string, referredBy?: string): Promise<WaitlistResult> {
    const { data, error } = await this.db.rpc("join_waitlist", { p_phone: phone, p_referred_by: referredBy ?? null }).single();
    if (error) fail("join_waitlist", error);
    const row = data as { referral_code: string; rank: number; activated: boolean };
    return { referralCode: row.referral_code, rank: row.rank, activated: row.activated };
  }

  async myInvite(userId: string): Promise<InviteView | null> {
    const { data, error } = await this.db.from("invites").select("code, max_uses, uses").eq("owner_user_id", userId).maybeSingle();
    if (error) fail("myInvite", error);
    return data ? { code: data.code, maxUses: data.max_uses, uses: data.uses } : null;
  }

  async promote(threshold = 3): Promise<number> {
    const { data, error } = await this.db.rpc("promote_waitlist", { p_threshold: threshold, p_limit: 50 });
    if (error) fail("promote_waitlist", error);
    return Number(data ?? 0);
  }

  async mint(code: string, maxUses: number): Promise<void> {
    const { error } = await this.db.from("invites").upsert({ code: code.toUpperCase(), max_uses: maxUses }, { onConflict: "code" });
    if (error) fail("mint", error);
  }

  async ensureInvite(userId: string): Promise<InviteView> {
    const existing = await this.myInvite(userId);
    if (existing) return existing;
    const code = randomCode();
    const { error } = await this.db.from("invites").insert({ code, owner_user_id: userId, max_uses: 3 });
    if (error) fail("ensureInvite", error);
    return { code, maxUses: 3, uses: 0 };
  }
}
