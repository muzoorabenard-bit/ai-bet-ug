-- Project Pi (a separate repo, same Supabase project) supplies picks without
-- real bookmaker odds (its fetch-fixtures always inserts odds as null), so
-- bookmaker_odds can no longer be required. bookmaker_event_url links a row
-- to the actual BetPawa match page, resolved separately by
-- src/cli/resolveEvents.ts (Project Pi only knows football-data.org's
-- fixture/team naming, not BetPawa's).

alter table recommended_bets
  alter column bookmaker_odds drop not null;

alter table recommended_bets
  add column if not exists bookmaker_event_url text;
