import { supabaseAdmin } from "@/src/db/admin";

/**
 * Ties a Supabase Auth user (phone OTP) to our `users` row for the same
 * phone, creating the row if the person has never texted the bot. Runs with
 * the service role because the link is what makes their RLS rows readable.
 */
export async function linkAuthUser(authUserId: string, phone: string): Promise<string> {
  const db = supabaseAdmin();
  const { data: existing, error } = await db.from("users").select("id, auth_user_id").eq("phone", phone).maybeSingle();
  if (error) throw new Error(`users.lookup: ${error.message}`);
  if (existing) {
    if (existing.auth_user_id !== authUserId) {
      const { error: linkError } = await db.from("users").update({ auth_user_id: authUserId }).eq("id", existing.id);
      if (linkError) throw new Error(`users.link: ${linkError.message}`);
    }
    return existing.id;
  }
  const { data: created, error: createError } = await db.from("users").insert({ phone, auth_user_id: authUserId }).select("id").single();
  if (createError || !created) throw new Error(`users.create: ${createError?.message}`);
  return created.id;
}
