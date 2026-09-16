import { redirect } from "next/navigation";
import { linkAuthUser } from "@/src/auth/link-user";
import { supabaseServer } from "@/src/db/server";
import { isWebDemo } from "@/src/web/demo/flag";
import { DEMO_VIEWER, DemoWebData } from "@/src/web/demo/store";
import { firstName } from "@/src/web/format";
import { SupabaseWebData } from "./supabase-data";
import type { Viewer, WebData } from "./types";

export type { Viewer, WebData } from "./types";

/**
 * The one entry point /app pages use. Demo mode returns the seed; otherwise
 * the signed-in user's Supabase client (RLS applies) or a bounce to sign-in.
 */
export async function webData(): Promise<{ viewer: Viewer; data: WebData }> {
  if (isWebDemo()) return { viewer: DEMO_VIEWER, data: new DemoWebData() };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.phone) redirect("/app/sign-in");
  const phone = `+${auth.user.phone.replace(/^\+/, "")}`;
  const userId = await linkAuthUser(auth.user.id, phone);
  const { data: me } = await supabase.from("users").select("display_name").eq("id", userId).maybeSingle();
  const viewer: Viewer = { userId, name: firstName(me?.display_name as string | null, phone), phoneTail: phone.slice(-4), live: true };
  return { viewer, data: new SupabaseWebData(supabase, userId) };
}
