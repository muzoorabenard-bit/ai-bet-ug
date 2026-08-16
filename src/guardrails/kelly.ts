import type { Settings } from "../db/types.js";

export interface KellyInput {
  modelProbability: number;
  odds: number; // real decimal odds observed live on BetPawa
  bankroll: number;
  settings: Pick<Settings, "kelly_fraction_cap" | "min_edge_pct" | "min_viable_stake">;
}

export type KellyResult =
  | { abstain: false; stake: number; fullKellyFraction: number; appliedFraction: number }
  | { abstain: true; reason: string };

/**
 * Fractional Kelly: f* = p - (1-p)/b, where b = odds - 1. Stake is capped at
 * settings.kelly_fraction_cap of full Kelly (default quarter-Kelly).
 *
 * Abstains (never forces a stake) when the real odds imply no edge over the
 * model's probability, or when the resulting stake is too small to be
 * meaningful — a too-small Kelly stake must never be rounded UP to a floor,
 * since that silently overrides the sizing discipline in the wrong
 * direction (a bigger bet than Kelly endorsed).
 */
export function computeKellyStake(input: KellyInput): KellyResult {
  const { modelProbability: p, odds, bankroll, settings } = input;

  if (odds <= 1) {
    return { abstain: true, reason: `invalid odds ${odds} (must be > 1)` };
  }

  const b = odds - 1;
  const q = 1 - p;
  const fullKellyFraction = p - q / b;

  if (fullKellyFraction <= 0) {
    return {
      abstain: true,
      reason: `no edge: model probability ${p.toFixed(4)} does not exceed the market's implied probability ${(1 / odds).toFixed(4)}`,
    };
  }

  const edgePct = (p - 1 / odds) * 100;
  if (edgePct < settings.min_edge_pct) {
    return {
      abstain: true,
      reason: `edge ${edgePct.toFixed(2)}% is below the required minimum ${settings.min_edge_pct}%`,
    };
  }

  const appliedFraction = settings.kelly_fraction_cap * fullKellyFraction;
  const stake = Math.round(bankroll * appliedFraction * 100) / 100;

  if (stake < settings.min_viable_stake) {
    return {
      abstain: true,
      reason: `computed stake ${stake} is below min_viable_stake ${settings.min_viable_stake}`,
    };
  }

  return { abstain: false, stake, fullKellyFraction, appliedFraction };
}
