-- Settlement pipeline (lives in project-pi as a new Edge Function, since it
-- needs zero browser automation and project-pi already owns the
-- football-data.org integration) needs somewhere to record real outcomes.

alter table bet_placements
  add column if not exists result text check (result in ('win', 'loss', 'void')),
  add column if not exists payout numeric(10,2),
  add column if not exists settled_at timestamptz;

-- Voids (postponed/cancelled matches) refund the stake — distinct from a
-- loss, and conflating them would corrupt any future win-rate calibration.
alter table bankroll_ledger drop constraint if exists bankroll_ledger_reason_check;
alter table bankroll_ledger add constraint bankroll_ledger_reason_check
  check (reason in (
    'stake_placed', 'settled_win', 'settled_loss', 'settled_void',
    'deposit', 'withdrawal', 'manual_adjustment'
  ));

-- Links to project-pi's matches.id (no FK: keeps this migration runnable
-- standalone even against a DB where project-pi's tables don't exist, e.g.
-- a test environment — same reasoning as bookmaker_event_url in 0004).
-- Set by analyze-matches's bridge insert (match.id is already in scope
-- there), avoiding fragile team-name/date fuzzy-matching for settlement.
alter table recommended_bets
  add column if not exists pi_match_id uuid;

create index if not exists idx_recommended_bets_pi_match_id on recommended_bets(pi_match_id);
