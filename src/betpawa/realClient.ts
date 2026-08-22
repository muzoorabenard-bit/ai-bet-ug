import type { BetPawaClient, BetPawaExecutionResult } from "./types.js";
import { AbstainError, PreSubmitError } from "./types.js";
import { openSession, closeSession, type BetPawaSession } from "./session.js";
import { placeBetFlow } from "./placeBet.js";
import { captureConfirmation } from "./screenshot.js";

/**
 * Real Playwright-driven BetPawa client — wired into index.ts as of
 * 2026-08-16. Login, dry-run, and one real live placement (slip
 * #12654578206) have all been verified against the live site.
 */
export const realClient: BetPawaClient = {
  async execute(bet, { dryRun, resolveStake }): Promise<BetPawaExecutionResult> {
    // openSession() itself is inside the try now (2026-08-22 fix) — it used
    // to be outside, so a login/homepage-load failure (seen live: BetPawa's
    // page rendering degraded, stuck on loading skeletons) propagated as an
    // uncaught, unclassified error instead of the retryable PreSubmitError
    // it actually is — nothing was ever submitted at that point.
    let session: BetPawaSession | undefined;

    try {
      try {
        session = await openSession();
      } catch (err) {
        // Nothing was ever submitted if we can't even log in — always safe
        // to retry, regardless of the underlying error's own type.
        throw new PreSubmitError(
          `failed to open BetPawa session: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const result = await placeBetFlow(session.page, bet, { dryRun, resolveStake });

      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          submittedOdds: result.observedOdds,
          stakePlaced: result.stake,
          kellyFractionApplied: result.kellyFractionApplied,
        };
      }

      const screenshotPath = await captureConfirmation(session.page, bet.id);

      return {
        ok: true,
        dryRun: false,
        submittedOdds: result.observedOdds,
        stakePlaced: result.stake,
        kellyFractionApplied: result.kellyFractionApplied,
        slipRef: result.slipRef,
        screenshotPath,
      };
    } catch (err) {
      if (err instanceof AbstainError) {
        return { ok: false, dryRun, errorMessage: err.message, abstained: true };
      }
      if (err instanceof PreSubmitError) {
        return { ok: false, dryRun, errorMessage: err.message, preSubmitFailure: true };
      }
      return {
        ok: false,
        dryRun,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (session) await closeSession(session);
    }
  },
};
