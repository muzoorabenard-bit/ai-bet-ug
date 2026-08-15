import type { RecommendedBet, Settings } from "../db/types.js";

export interface GuardrailContext {
  bet: RecommendedBet;
  settings: Settings;
  activePlacementCount: number; // existing in_progress/success/dry_run_success rows for this bet
  stakePlacedTodayTotal: number; // sum of already-succeeded stakes today (excludes this bet)
  now?: Date;
  minMinutesBeforeKickoff?: number;
}

export type GuardrailResult = { allowed: true } | { allowed: false; reason: string };

const DEFAULT_MIN_MINUTES_BEFORE_KICKOFF = 2;

/**
 * Pure function — no DB/Playwright access — encoding every safety rule that
 * must pass before a bet is ever handed to the browser automation layer.
 * Keep it this way so it stays independently unit-testable.
 */
export function checkGuardrails(ctx: GuardrailContext): GuardrailResult {
  const { bet, settings, activePlacementCount, stakePlacedTodayTotal } = ctx;
  const now = ctx.now ?? new Date();
  const minMinutes = ctx.minMinutesBeforeKickoff ?? DEFAULT_MIN_MINUTES_BEFORE_KICKOFF;

  if (settings.kill_switch) {
    return { allowed: false, reason: "kill_switch is on" };
  }

  if (bet.status !== "approved") {
    return { allowed: false, reason: `bet status is '${bet.status}', not 'approved'` };
  }

  if (!bet.auto_execute) {
    return { allowed: false, reason: "auto_execute is false" };
  }

  if (bet.recommended_stake > settings.max_stake_per_bet) {
    return {
      allowed: false,
      reason: `recommended_stake ${bet.recommended_stake} exceeds max_stake_per_bet ${settings.max_stake_per_bet}`,
    };
  }

  const projectedDailyTotal = stakePlacedTodayTotal + bet.recommended_stake;
  if (projectedDailyTotal > settings.max_daily_stake_total) {
    return {
      allowed: false,
      reason: `projected daily total ${projectedDailyTotal} exceeds max_daily_stake_total ${settings.max_daily_stake_total}`,
    };
  }

  if (activePlacementCount > 0) {
    return { allowed: false, reason: "an active or successful placement already exists for this bet" };
  }

  const kickoff = new Date(bet.kickoff_at);
  const minutesUntilKickoff = (kickoff.getTime() - now.getTime()) / 60_000;
  if (minutesUntilKickoff < minMinutes) {
    return {
      allowed: false,
      reason: `kickoff is only ${minutesUntilKickoff.toFixed(1)} minutes away (minimum ${minMinutes})`,
    };
  }

  return { allowed: true };
}
