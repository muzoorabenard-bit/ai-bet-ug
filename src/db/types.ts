export type RecommendedBetStatus =
  | "pending_review"
  | "approved"
  | "picked_up"
  | "placed"
  | "skipped"
  | "failed"
  | "expired";

export type BetPlacementStatus =
  | "in_progress"
  | "success"
  | "dry_run_success"
  | "failed"
  | "aborted_guardrail";

export interface Settings {
  id: true;
  kill_switch: boolean;
  dry_run_default: boolean;
  max_stake_per_bet: number;
  max_daily_stake_total: number;
  current_bankroll: number;
  kelly_fraction_cap: number;
  min_edge_pct: number;
  min_viable_stake: number;
  updated_at: string;
}

export interface RecommendedBet {
  id: number;
  created_at: string;

  league: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;

  market: string;
  selection: string;
  model_odds: number | null;
  model_probability: number | null;
  bookmaker_odds: number | null;
  edge_pct: number | null;

  recommended_stake: number;
  auto_execute: boolean;
  dry_run: boolean;
  source: string;
  bookmaker_event_url: string | null;
  pi_match_id: string | null;

  status: RecommendedBetStatus;
  status_reason: string | null;

  updated_at: string;
}

export type BetResult = "win" | "loss" | "void";

export interface BetPlacement {
  id: number;
  recommended_bet_id: number;
  created_at: string;

  attempt_number: number;

  dry_run: boolean;
  submitted_odds: number | null;
  stake_placed: number | null;
  bookmaker_slip_ref: string | null;
  screenshot_path: string | null;

  status: BetPlacementStatus;
  error_message: string | null;

  result: BetResult | null;
  payout: number | null;
  settled_at: string | null;
  kelly_fraction_applied: number | null;

  started_at: string;
  completed_at: string | null;
}

export interface BankrollLedgerEntry {
  id: number;
  occurred_at: string;
  change_amount: number;
  balance_after: number;
  reason:
    | "stake_placed"
    | "settled_win"
    | "settled_loss"
    | "settled_void"
    | "deposit"
    | "withdrawal"
    | "manual_adjustment";
  bet_placement_id: number | null;
  notes: string | null;
}
