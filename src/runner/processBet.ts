import type { RecommendedBet, Settings } from "../db/types.js";
import * as recommendedBets from "../db/recommendedBets.repo.js";
import * as betPlacements from "../db/betPlacements.repo.js";
import * as bankroll from "../db/bankroll.repo.js";
import { checkGuardrails } from "../guardrails/checkGuardrails.js";
import { betPawaClient } from "../betpawa/index.js";
import { logger } from "./logger.js";

export async function processBet(bet: RecommendedBet, settings: Settings): Promise<void> {
  const log = logger.child({ recommendedBetId: bet.id });

  // 1. Guardrails — all checked before claiming the row or touching the browser.
  const [activePlacementCount, stakePlacedTodayTotal] = await Promise.all([
    betPlacements.countActivePlacements(bet.id),
    betPlacements.sumPlacedStakeToday(),
  ]);

  const guardrailResult = checkGuardrails({
    bet,
    settings,
    activePlacementCount,
    stakePlacedTodayTotal,
  });

  if (!guardrailResult.allowed) {
    log.warn({ reason: guardrailResult.reason }, "guardrail blocked bet, skipping");
    await recommendedBets.setStatus(bet.id, "skipped", guardrailResult.reason);
    return;
  }

  // 2. Claim (conditional update) — loses the race gracefully if another
  // process already claimed this row.
  const claimed = await recommendedBets.claimForProcessing(bet.id);
  if (!claimed) {
    log.info("bet was claimed by another process, skipping");
    return;
  }

  // The global dry_run_default can only make things safer, never less safe:
  // it forces dry-run even if the row itself says dry_run=false.
  const dryRun = bet.dry_run || settings.dry_run_default;
  const attemptNumber = await betPlacements.nextAttemptNumber(bet.id);

  const placement = await betPlacements.startPlacement({
    recommendedBetId: bet.id,
    attemptNumber,
    dryRun,
  });

  log.info({ dryRun, attemptNumber }, "placement started");

  try {
    const result = await betPawaClient.execute(bet, { dryRun });

    if (!result.ok) {
      throw new Error(result.errorMessage ?? "betPawaClient reported failure with no message");
    }

    await betPlacements.completePlacement(placement.id, {
      status: dryRun ? "dry_run_success" : "success",
      submitted_odds: result.submittedOdds,
      stake_placed: result.stakePlaced,
      bookmaker_slip_ref: result.slipRef,
      screenshot_path: result.screenshotPath,
    });

    await recommendedBets.setStatus(bet.id, "placed");

    if (!dryRun && result.stakePlaced) {
      await bankroll.appendEntry({
        changeAmount: -result.stakePlaced,
        reason: "stake_placed",
        betPlacementId: placement.id,
        notes: `${bet.league}: ${bet.home_team} v ${bet.away_team} — ${bet.market}/${bet.selection}`,
      });
    }

    log.info({ dryRun, slipRef: result.slipRef }, "placement completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ errorMessage }, "placement failed");

    // No blind retries: a failed placement stays 'failed' until a human
    // reviews it and manually flips the recommended_bet back to 'approved',
    // which will start a fresh attempt_number next cycle.
    await betPlacements.completePlacement(placement.id, {
      status: "failed",
      error_message: errorMessage,
    });
    await recommendedBets.setStatus(bet.id, "failed", errorMessage);
  }
}
