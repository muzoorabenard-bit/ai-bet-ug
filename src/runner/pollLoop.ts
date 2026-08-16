import { env } from "../config/env.js";
import { getSettings, rolloverWeekIfDue, tripKillSwitchForDrawdown } from "../db/settings.repo.js";
import { getApprovedActionable } from "../db/recommendedBets.repo.js";
import { checkWeeklyDrawdown } from "../guardrails/drawdown.js";
import { processBet } from "./processBet.js";
import { notifyTelegram } from "../notify/telegram.js";
import { logger } from "./logger.js";

export async function runOneCycle(): Promise<void> {
  let settings = await getSettings();
  settings = await rolloverWeekIfDue(settings);

  // Runs every cycle, independent of kill_switch/queued work: the bankroll
  // changes asynchronously via settlement (a separately-scheduled process),
  // so a breach with nothing queued would otherwise go unnoticed until the
  // next bet attempt.
  const drawdown = checkWeeklyDrawdown(settings);
  if (drawdown.breached && !settings.kill_switch) {
    logger.warn(
      { weeklyPnlPct: drawdown.weeklyPnlPct.toFixed(2), limit: settings.weekly_drawdown_limit_pct },
      "weekly drawdown limit breached — tripping kill switch",
    );
    await tripKillSwitchForDrawdown();
    settings.kill_switch = true;

    await notifyTelegram(
      `🛑 WEEKLY DRAWDOWN LIMIT BREACHED — kill switch auto-tripped\n` +
        `Weekly P&L: ${drawdown.weeklyPnlPct.toFixed(2)}% (limit: -${settings.weekly_drawdown_limit_pct}%)\n` +
        `Bankroll: ${settings.current_bankroll} UGX\n\nSystem is fully autonomous — it will stay stopped until someone manually turns the kill switch back off.`,
    );
  }

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
