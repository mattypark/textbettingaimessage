import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/db/admin";
import { supabaseServer } from "@/src/db/server";
import { SupabaseMediaStore } from "@/src/proof/media-store";

/** Proof media for participants only: RLS on `proofs` decides, then a short signed URL. */
export async function GET(_request: Request, { params }: RouteContext<"/api/media/[proofId]">) {
  const { proofId } = await params;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("proofs").select("storage_path").eq("id", proofId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = await new SupabaseMediaStore(supabaseAdmin()).signedUrl(data.storage_path, 300);
  return NextResponse.redirect(url, { status: 302 });
}
