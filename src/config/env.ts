import { z } from "zod";

/**
 * Validated process environment. Import `env` instead of touching
 * `process.env` so a missing key fails at boot with a readable message rather
 * than as an `undefined` deep inside a webhook.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TRANSPORT: z.enum(["linq", "sendblue", "fake"]).default("fake"),
  STAKE_MODE: z.enum(["points", "cash"]).default("points"),
  LEGAL_CLEARANCE: z.string().optional(),
  CASH_PARTNER: z.string().optional(),
  BOT_NAMES: z.string().default("mushy"),
  /** "0" opens the bot to anyone (dev). Default: invite-only. */
  INVITE_ONLY: z.string().default("1"),
  /** Spam guard: bot turns one sender / one chat may trigger per hour. Reactions are free. */
  BOT_TURNS_PER_USER_HOUR: z.coerce.number().int().positive().default(30),
  BOT_TURNS_PER_CHAT_HOUR: z.coerce.number().int().positive().default(120),
  /** "0" turns off settle-up pay links after social stakes. Points stakes never get links. */
  SETTLE_UP: z.string().default("1"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  // Linq
  LINQ_API_KEY: z.string().optional(),
  LINQ_WEBHOOK_SECRET: z.string().optional(),
  LINQ_FROM_NUMBER: z.string().optional(),

  // Sendblue
  SENDBLUE_API_KEY: z.string().optional(),
  SENDBLUE_API_SECRET: z.string().optional(),
  SENDBLUE_FROM_NUMBER: z.string().optional(),
  SENDBLUE_SIGNING_SECRET: z.string().optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // LLM vendor. MODEL_PROVIDER forces one; otherwise the first key present wins (OpenAI, then Anthropic).
  MODEL_PROVIDER: z.enum(["openai", "anthropic"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5"),
  OPENAI_MODEL_SMALL: z.string().default("gpt-5-mini"),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Internal
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // .env.example ships blank values; a blank key means "not set", not "".
  const present = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ""));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook — drop the cache so a spec can swap env vars. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function botNames(): string[] {
  return env()
    .BOT_NAMES.split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}
