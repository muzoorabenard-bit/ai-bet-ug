import type { Settings } from "../db/types.js";

export interface DrawdownCheckResult {
  breached: boolean;
  weeklyPnlPct: number;
}

/**
 * Pure function — compares current bankroll against the stored week-start
 * baseline (settings.repo.ts's rolloverWeekIfDue keeps that baseline
 * current). A stored baseline avoids ambiguous "balance at start of week"
 * edge cases that computing this on the fly from ledger history would hit.
 */
export function checkWeeklyDrawdown(
  settings: Pick<Settings, "current_bankroll" | "week_start_bankroll" | "weekly_drawdown_limit_pct">,
): DrawdownCheckResult {
  if (settings.week_start_bankroll <= 0) {
    return { breached: false, weeklyPnlPct: 0 };
  }

  const weeklyPnlPct =
    ((settings.current_bankroll - settings.week_start_bankroll) / settings.week_start_bankroll) * 100;

  return { breached: weeklyPnlPct <= -settings.weekly_drawdown_limit_pct, weeklyPnlPct };
}
