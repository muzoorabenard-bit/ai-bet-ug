-- Fractional-Kelly stake sizing, computed at placement time from the
-- model's win probability and the REAL odds read live from BetPawa (not the
-- flat confidence-tier recommended_stake decided days in advance by
-- analyze-matches, which stays purely an advisory display number from here
-- on — see src/guardrails/kelly.ts for the formula).

alter table recommended_bets
  add column if not exists model_probability numeric(6,5);

alter table settings
  add column if not exists kelly_fraction_cap numeric(4,3) not null default 0.25,
  add column if not exists min_edge_pct numeric(5,3) not null default 0,
  add column if not exists min_viable_stake numeric(10,2) not null default 500.00;

-- Audit trail for the future self-improving-calibration work: the effective
-- Kelly fraction actually applied (post-cap) for this specific placement,
-- which can't be reconstructed later once kelly_fraction_cap changes over
-- time.
alter table bet_placements
  add column if not exists kelly_fraction_applied numeric(6,5);
