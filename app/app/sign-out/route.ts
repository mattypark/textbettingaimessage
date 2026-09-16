import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/db/server";
import { isWebDemo } from "@/src/web/demo/flag";

export async function POST(request: Request) {
  const home = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  if (isWebDemo()) return home;
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return home;
}
