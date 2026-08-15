import type { BetPawaClient, BetPawaExecutionResult } from "./types.js";
import { openSession, closeSession } from "./session.js";
import { placeBetFlow } from "./placeBet.js";
import { captureConfirmation } from "./screenshot.js";

/**
 * Real Playwright-driven BetPawa client. NOT wired into index.ts yet —
 * selectors.ts is still full of TODO placeholders. Do not switch
 * src/betpawa/index.ts to export this until login + a dry-run walkthrough
 * have been verified manually (see README "Selector discovery").
 */
export const realClient: BetPawaClient = {
  async execute(bet, { dryRun }): Promise<BetPawaExecutionResult> {
    const session = await openSession();

    try {
      const result = await placeBetFlow(session.page, bet, { dryRun });

      if (dryRun) {
        return { ok: true, dryRun: true, submittedOdds: result.observedOdds };
      }

      // screenshot needs a placement id, which the caller assigns after this
      // resolves — captured by processBet.ts calling captureConfirmation
      // separately isn't possible here, so we screenshot with bet.id instead
      // as a stand-in identifier for this pre-wiring scaffold.
      const screenshotPath = await captureConfirmation(session.page, bet.id);

      return {
        ok: true,
        dryRun: false,
        submittedOdds: result.observedOdds,
        stakePlaced: bet.recommended_stake,
        slipRef: result.slipRef,
        screenshotPath,
      };
    } catch (err) {
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
