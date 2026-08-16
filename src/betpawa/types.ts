import type { RecommendedBet } from "../db/types.js";

export interface BetPawaExecutionResult {
  ok: boolean;
  dryRun: boolean;
  submittedOdds?: number;
  stakePlaced?: number;
  kellyFractionApplied?: number;
  slipRef?: string;
  screenshotPath?: string;
  errorMessage?: string;
  /** True when the placement was deliberately skipped (no edge, or a stake
   * guardrail blocked the computed amount) rather than failed — the runner
   * treats this as 'skipped', not 'failed'. */
  abstained?: boolean;
}

export type ResolveStakeResult =
  | { abstain: true; reason: string }
  | { abstain: false; stake: number; kellyFractionApplied?: number };

/**
 * Injected into the browser-automation layer (placeBet.ts) so the real
 * stake can be decided right when the real odds become available, without a
 * second page navigation. Owned by processBet.ts, which has bet/settings/
 * bankroll in scope — keeps all betting-decision logic (Kelly math, stake
 * guardrails) out of the Playwright layer.
 */
export type ResolveStake = (observedOdds: number) => Promise<ResolveStakeResult>;

export class AbstainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbstainError";
  }
}

/**
 * The interface processBet.ts depends on. Swap the implementation (stub vs
 * real Playwright) in src/betpawa/index.ts without touching runner logic.
 */
export interface BetPawaClient {
  execute(bet: RecommendedBet, opts: { dryRun: boolean; resolveStake: ResolveStake }): Promise<BetPawaExecutionResult>;
}
