import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  BETPAWA_PHONE: z.string().min(1),
  BETPAWA_PASSWORD: z.string().min(1),
  BETPAWA_BASE_URL: z.string().url().default("https://www.betpawa.ug"),

  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  HEADLESS: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),

  // Optional: notifications (src/notify/telegram.ts) no-op gracefully if
  // either is unset, so this deliberately isn't required.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

// Fail fast: any missing/invalid var throws immediately at import time,
// before any DB call or browser launch — never halfway through a bet flow.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid or missing environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check your .env against .env.example");
}

export const env = parsed.data;
