create table if not exists bet_placements (
  id                  bigint generated always as identity primary key,
  recommended_bet_id  bigint not null references recommended_bets(id),
  created_at          timestamptz not null default now(),

  attempt_number      int not null default 1,

  dry_run             boolean not null,
  submitted_odds      numeric(6,2),
  stake_placed        numeric(10,2),
  bookmaker_slip_ref  text,
  screenshot_path     text,

  status              text not null default 'in_progress' check (status in (
                        'in_progress', 'success', 'dry_run_success',
                        'failed', 'aborted_guardrail'
                      )),
  error_message       text,

  started_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- The real teeth of the duplicate-submission guard: even if the runner races
-- (two instances, or a crash-and-restart mid-flight), Postgres itself refuses
-- a second concurrent/successful placement for the same recommended bet.
create unique index if not exists uq_bet_placements_active_attempt
  on bet_placements(recommended_bet_id)
  where status in ('in_progress', 'success', 'dry_run_success');

create index if not exists idx_bet_placements_recommended_bet
  on bet_placements(recommended_bet_id);

alter table bet_placements enable row level security;

alter table bankroll_ledger
  add constraint fk_bankroll_bet_placement
  foreign key (bet_placement_id) references bet_placements(id);
