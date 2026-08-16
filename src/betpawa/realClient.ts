import type { BetPawaClient, BetPawaExecutionResult } from "./types.js";
import { AbstainError } from "./types.js";
import { openSession, closeSession } from "./session.js";
import { placeBetFlow } from "./placeBet.js";
import { captureConfirmation } from "./screenshot.js";

/**
 * Real Playwright-driven BetPawa client — wired into index.ts as of
 * 2026-08-16. Login, dry-run, and one real live placement (slip
 * #12654578206) have all been verified against the live site.
 */
export const realClient: BetPawaClient = {
  async execute(bet, { dryRun, resolveStake }): Promise<BetPawaExecutionResult> {
    const session = await openSession();

    try {
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
      return {
        ok: false,
        dryRun,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await closeSession(session);
    }
  },
};
