import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/src/config/env";

let client: SupabaseClient | undefined;

export function isSupabaseAdminConfigured(): boolean {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  return Boolean(NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Service-role client for server code (webhooks, cron, agent tools). Bypasses
 * RLS — never import from anything that ships to the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
