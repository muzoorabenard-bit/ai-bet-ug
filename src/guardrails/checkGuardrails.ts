import type { RecommendedBet, Settings } from "../db/types.js";

export type GuardrailResult = { allowed: true } | { allowed: false; reason: string };

const DEFAULT_MIN_MINUTES_BEFORE_KICKOFF = 2;

export interface PreflightGuardrailContext {
  bet: RecommendedBet;
  settings: Settings;
  activePlacementCount: number; // existing in_progress/success/dry_run_success rows for this bet
  now?: Date;
  minMinutesBeforeKickoff?: number;
}

/**
 * Everything checkable BEFORE the real stake is known — runs once, before
 * the bet is claimed or the browser is ever touched. Pure function, no
 * DB/Playwright access, independently unit-testable.
 */
export function checkPreflightGuardrails(ctx: PreflightGuardrailContext): GuardrailResult {
  const { bet, settings, activePlacementCount } = ctx;
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

export interface StakeGuardrailContext {
  stake: number;
  settings: Settings;
  stakePlacedTodayTotal: number; // sum of already-succeeded stakes today (excludes this bet)
}

/**
 * Re-checked a second time, once the real Kelly-computed stake is known
 * (the real odds, and therefore the real stake, are only available at
 * placement time — see src/guardrails/kelly.ts).
 */
export function checkStakeGuardrails(ctx: StakeGuardrailContext): GuardrailResult {
  const { stake, settings, stakePlacedTodayTotal } = ctx;

  if (stake > settings.max_stake_per_bet) {
    return {
      allowed: false,
      reason: `computed stake ${stake} exceeds max_stake_per_bet ${settings.max_stake_per_bet}`,
    };
  }

  const projectedDailyTotal = stakePlacedTodayTotal + stake;
  if (projectedDailyTotal > settings.max_daily_stake_total) {
    return {
      allowed: false,
      reason: `projected daily total ${projectedDailyTotal} exceeds max_daily_stake_total ${settings.max_daily_stake_total}`,
    };
  }

  return { allowed: true };
}
