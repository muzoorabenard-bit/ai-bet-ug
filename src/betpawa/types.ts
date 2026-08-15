import type { RecommendedBet } from "../db/types.js";

export interface BetPawaExecutionResult {
  ok: boolean;
  dryRun: boolean;
  submittedOdds?: number;
  stakePlaced?: number;
  slipRef?: string;
  screenshotPath?: string;
  errorMessage?: string;
}

/**
 * The interface processBet.ts depends on. Swap the implementation (stub vs
 * real Playwright) in src/betpawa/index.ts without touching runner logic.
 */
export interface BetPawaClient {
  execute(bet: RecommendedBet, opts: { dryRun: boolean }): Promise<BetPawaExecutionResult>;
}
