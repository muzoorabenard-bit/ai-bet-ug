-- The clean interface table: a future prediction model (or, for now, manual
-- entry / cli/seedFakeBet.ts) inserts rows here. The runner doesn't care how
-- a row got created — only that it reaches status='approved' with
-- auto_execute=true before it will ever touch a browser.

create table if not exists recommended_bets (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),

  league              text not null,
  home_team           text not null,
  away_team           text not null,
  kickoff_at          timestamptz not null,

  market              text not null,
  selection           text not null,
  model_odds          numeric(6,2),
  bookmaker_odds      numeric(6,2) not null,
  edge_pct            numeric(6,3),

  recommended_stake   numeric(10,2) not null,
  auto_execute        boolean not null default false,
  dry_run             boolean not null default true,
  source              text not null default 'manual',

  status              text not null default 'pending_review' check (status in (
                        'pending_review', 'approved', 'picked_up',
                        'placed', 'skipped', 'failed', 'expired'
                      )),
  status_reason       text,

  updated_at          timestamptz not null default now()
);

create index if not exists idx_recommended_bets_status on recommended_bets(status);
create index if not exists idx_recommended_bets_kickoff on recommended_bets(kickoff_at);

alter table recommended_bets enable row level security;
