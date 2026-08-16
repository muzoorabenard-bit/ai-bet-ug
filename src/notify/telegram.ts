import { env } from "../config/env.js";
import { logger } from "../runner/logger.js";

/**
 * Best-effort side channel — a Telegram failure (missing config, API
 * error, network blip) must never break bet placement/settlement, so this
 * only ever logs, never throws.
 */
export async function notifyTelegram(text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    logger.debug("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — skipping notification");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, body: await res.text() }, "telegram notification failed");
    }
  } catch (err) {
    logger.warn({ err }, "telegram notification threw");
  }
}
