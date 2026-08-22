import type { RecommendedBet, Settings } from "../db/types.js";
import * as recommendedBets from "../db/recommendedBets.repo.js";
import * as betPlacements from "../db/betPlacements.repo.js";
import * as bankroll from "../db/bankroll.repo.js";
import { checkPreflightGuardrails, checkStakeGuardrails } from "../guardrails/checkGuardrails.js";
import { computeKellyStake } from "../guardrails/kelly.js";
import { betPawaClient } from "../betpawa/index.js";
import type { ResolveStake } from "../betpawa/types.js";
import { notifyTelegram } from "../notify/telegram.js";
import { logger } from "./logger.js";

// A pre-submission failure retries automatically (nothing was ever
// submitted, so no duplicate-bet risk) — but not forever. Kickoff-timing
// guardrails naturally cut this off as the match approaches regardless;
// this cap exists purely for the case of a persistently broken
// match/selector, so it eventually surfaces as a real 'failed' alert
// instead of quietly retrying every cycle for days.
const MAX_PRESUBMIT_ATTEMPTS = 10;

export async function processBet(bet: RecommendedBet, settings: Settings): Promise<void> {
  const log = logger.child({ recommendedBetId: bet.id });

  // 1. Preflight guardrails — everything checkable before the real stake is
  // known. Checked before claiming the row or touching the browser.
  const [activePlacementCount, stakePlacedTodayTotal] = await Promise.all([
    betPlacements.countActivePlacements(bet.id),
    betPlacements.sumPlacedStakeToday(),
  ]);

  const preflightResult = checkPreflightGuardrails({ bet, settings, activePlacementCount });

  if (!preflightResult.allowed) {
    log.warn({ reason: preflightResult.reason }, "preflight guardrail blocked bet, skipping");
    await recommendedBets.setStatus(bet.id, "skipped", preflightResult.reason);
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

  // 3. The real stake is decided here, once the real odds are known (see
  // resolveStake's doc comment in betpawa/types.ts) — Kelly math + a second
  // guardrail pass against the actual computed number, never the flat
  // recommended_stake Project Pi wrote days in advance.
  const resolveStake: ResolveStake = async (observedOdds) => {
    if (bet.model_probability === null) {
      return { abstain: true, reason: "recommended_bets.model_probability is not set — cannot compute a Kelly stake" };
    }

    const currentBankroll = await bankroll.getCurrentBalance();
    const kelly = computeKellyStake({
      modelProbability: bet.model_probability,
      odds: observedOdds,
      bankroll: currentBankroll,
      settings,
    });

    if (kelly.abstain) {
      return { abstain: true, reason: kelly.reason };
    }

    const stakeGuardrailResult = checkStakeGuardrails({
      stake: kelly.stake,
      settings,
      stakePlacedTodayTotal,
    });

    if (!stakeGuardrailResult.allowed) {
      return { abstain: true, reason: stakeGuardrailResult.reason };
    }

    return { abstain: false, stake: kelly.stake, kellyFractionApplied: kelly.appliedFraction };
  };

  try {
    const result = await betPawaClient.execute(bet, { dryRun, resolveStake });

    if (!result.ok) {
      if (result.abstained) {
        await betPlacements.completePlacement(placement.id, {
          status: "aborted_guardrail",
          error_message: result.errorMessage,
        });
        await recommendedBets.setStatus(bet.id, "skipped", result.errorMessage);
        log.info({ reason: result.errorMessage }, "abstained — no edge or a stake guardrail blocked the computed amount");
        return;
      }

      if (result.preSubmitFailure) {
        await betPlacements.completePlacement(placement.id, {
          status: "failed",
          error_message: result.errorMessage,
        });

        if (attemptNumber < MAX_PRESUBMIT_ATTEMPTS) {
          // Nothing was submitted — safe to retry. Revert the claim so the
          // next poll cycle's getApprovedActionable() picks this row back
          // up (still gated by kickoff-timing/duplicate guardrails as usual).
          await recommendedBets.setStatus(
            bet.id,
            "approved",
            `attempt ${attemptNumber} failed before submission, will retry: ${result.errorMessage}`,
          );
          log.warn({ attemptNumber, reason: result.errorMessage }, "pre-submission failure, will retry next cycle");
          if (attemptNumber === 1) {
            await notifyTelegram(
              `🔄 Placement attempt failed before submitting (will retry automatically)\n` +
                `${bet.league}: ${bet.home_team} vs ${bet.away_team}\n${bet.market} — ${bet.selection}\n${result.errorMessage}`,
            );
          }
        } else {
          await recommendedBets.setStatus(
            bet.id,
            "failed",
            `gave up after ${attemptNumber} pre-submission attempts: ${result.errorMessage}`,
          );
          await notifyTelegram(
            `⚠️ PLACEMENT FAILED after ${attemptNumber} attempts — needs review\n` +
              `${bet.league}: ${bet.home_team} vs ${bet.away_team}\n${bet.market} — ${bet.selection}\n${result.errorMessage}`,
          );
        }
        return;
      }

      throw new Error(result.errorMessage ?? "betPawaClient reported failure with no message");
    }

    await betPlacements.completePlacement(placement.id, {
      status: dryRun ? "dry_run_success" : "success",
      submitted_odds: result.submittedOdds,
      stake_placed: result.stakePlaced,
      kelly_fraction_applied: result.kellyFractionApplied,
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

    log.info({ dryRun, stake: result.stakePlaced, slipRef: result.slipRef }, "placement completed");

    const label = dryRun ? "🧪 DRY RUN" : "✅ BET PLACED";
    await notifyTelegram(
      `${label}\n${bet.league}: ${bet.home_team} vs ${bet.away_team}\n${bet.market} — ${bet.selection}\n` +
        `Stake: ${result.stakePlaced} UGX @ ${result.submittedOdds}` +
        (result.slipRef ? `\nSlip: ${result.slipRef}` : ""),
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ errorMessage }, "placement failed");

    // Reached only for failures NOT already handled above as retryable
    // (preSubmitFailure) or as a deliberate abstain: either a genuinely
    // ambiguous post-confirm-click failure (we don't know if the bet went
    // through — see the balance-delta comment in placeBet.ts, a blind retry
    // here risks placing it twice) or a deterministic structural error
    // (unsupported market/selection) that retrying could never fix. Both
    // stay 'failed' with no automatic retry — this notification is the only
    // thing that surfaces "this needs a human" in fully-autonomous mode.
    await betPlacements.completePlacement(placement.id, {
      status: "failed",
      error_message: errorMessage,
    });
    await recommendedBets.setStatus(bet.id, "failed", errorMessage);

    await notifyTelegram(
      `⚠️ PLACEMENT FAILED — needs review\n${bet.league}: ${bet.home_team} vs ${bet.away_team}\n` +
        `${bet.market} — ${bet.selection}\n${errorMessage}`,
    );
  }
}
