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
  /** True when the failure happened before anything was submitted (see
   * PreSubmitError below) — the runner treats this as safe to automatically
   * retry, rather than a terminal 'failed' needing a human to revive it. */
  preSubmitFailure?: boolean;
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
 * Thrown for a failure that happens strictly BEFORE the confirm button is
 * ever clicked — page navigation, market card lookup, odds reading. Nothing
 * has been submitted, so no risk of a duplicate real bet: the runner treats
 * this as safe to automatically retry on the next cycle (up to a cap),
 * instead of dying permanently in a 'failed' state that (in fully-autonomous
 * mode, with no human reviewing individual bets) nobody would ever revive.
 *
 * Deliberately NOT used for structural errors (unsupported market,
 * unrecognized selection) — those are deterministic and retrying achieves
 * nothing; nor for anything from the confirm click onward, where we
 * genuinely don't know if the bet went through (see the balance-delta
 * comment in placeBet.ts) and a blind retry risks placing it twice.
 */
export class PreSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreSubmitError";
  }
}

/**
 * The interface processBet.ts depends on. Swap the implementation (stub vs
 * real Playwright) in src/betpawa/index.ts without touching runner logic.
 */
export interface BetPawaClient {
  execute(bet: RecommendedBet, opts: { dryRun: boolean; resolveStake: ResolveStake }): Promise<BetPawaExecutionResult>;
}
