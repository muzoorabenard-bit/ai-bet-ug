-- Weekly drawdown circuit breaker: auto-trips the kill switch if a week's
-- realized loss crosses a threshold, so a bad stretch can't compound into
-- ruin. Stored baseline + explicit rollover (not computed on the fly from
-- ledger history) — avoids ambiguous "balance at start of week" edge cases.

alter table settings
  add column if not exists week_start_at timestamptz not null default now(),
  add column if not exists week_start_bankroll numeric(10,2) not null default 0,
  add column if not exists weekly_drawdown_limit_pct numeric(5,2) not null default 20.00;

update settings set week_start_bankroll = current_bankroll where id = true;
