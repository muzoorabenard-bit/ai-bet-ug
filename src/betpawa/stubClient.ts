import type { BetPawaClient, BetPawaExecutionResult } from "./types.js";

/**
 * Stub implementation used until real login/placement automation (session.ts,
 * login.ts, placeBet.ts) has verified selectors — see README "Selector
 * discovery". Simulates the shape of a real run (a short delay, then a
 * result) without ever launching a browser or touching BetPawa, so the
 * runner's guardrails/state-machine/duplicate-guard can be proven end-to-end
 * first. Swap the export in index.ts for the real client once ready.
 */
export const stubClient: BetPawaClient = {
  async execute(bet, { dryRun }): Promise<BetPawaExecutionResult> {
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        submittedOdds: bet.bookmaker_odds,
      };
    }

    return {
      ok: true,
      dryRun: false,
      submittedOdds: bet.bookmaker_odds,
      stakePlaced: bet.recommended_stake,
      slipRef: `STUB-${bet.id}-${Date.now()}`,
    };
  },
};
