import { env } from "../config/env.js";
import { getSettings } from "../db/settings.repo.js";
import { getApprovedActionable } from "../db/recommendedBets.repo.js";
import { processBet } from "./processBet.js";
import { logger } from "./logger.js";

export async function runOneCycle(): Promise<void> {
  const settings = await getSettings();

  if (settings.kill_switch) {
    logger.info("kill switch is on, sleeping");
    return;
  }

  const candidates = await getApprovedActionable();
  if (candidates.length === 0) {
    logger.debug("no approved actionable bets");
    return;
  }

  logger.info({ count: candidates.length }, "processing approved bets");

  // Sequential, not parallel: avoids concurrent BetPawa sessions racing on
  // one account/browser context.
  for (const bet of candidates) {
    await processBet(bet, settings);
  }
}

export async function startPollLoop(): Promise<void> {
  logger.info({ intervalSeconds: env.POLL_INTERVAL_SECONDS }, "starting poll loop");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOneCycle();
    } catch (err) {
      logger.error({ err }, "poll cycle failed unexpectedly");
    }
    await sleep(env.POLL_INTERVAL_SECONDS * 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
