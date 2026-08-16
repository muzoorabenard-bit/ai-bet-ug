import type { BetPawaClient, BetPawaExecutionResult } from "./types.js";

/**
 * Stub implementation used to prove the runner's guardrails/state-machine/
 * duplicate-guard end-to-end without ever launching a browser or touching
 * BetPawa. Still exercises the resolveStake callback (with a plausible fake
 * odds value) so the Kelly/guardrail path gets tested too, not just skipped.
 */
export const stubClient: BetPawaClient = {
  async execute(bet, { dryRun, resolveStake }): Promise<BetPawaExecutionResult> {
    await new Promise((resolve) => setTimeout(resolve, 250));

    const fakeOdds = bet.bookmaker_odds ?? bet.model_odds ?? 2.0;
    const decision = await resolveStake(fakeOdds);

    if (decision.abstain) {
      return { ok: false, dryRun, errorMessage: decision.reason, abstained: true };
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        submittedOdds: fakeOdds,
        stakePlaced: decision.stake,
        kellyFractionApplied: decision.kellyFractionApplied,
      };
    }

    return {
      ok: true,
      dryRun: false,
      submittedOdds: fakeOdds,
      stakePlaced: decision.stake,
      kellyFractionApplied: decision.kellyFractionApplied,
      slipRef: `STUB-${bet.id}-${Date.now()}`,
    };
  },
};
