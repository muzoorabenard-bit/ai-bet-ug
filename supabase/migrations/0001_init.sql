-- Settings singleton + bankroll ledger.
-- RLS is enabled with NO policies granted to anon/authenticated: only the
-- service-role key (used exclusively by the local runner) can read/write.
-- service_role bypasses RLS by design, so "enabled, zero policies" is the
-- simplest safe posture for a single-user tool with no public frontend yet.

create table if not exists settings (
  id                     boolean primary key default true check (id),
  kill_switch            boolean not null default true,
  dry_run_default        boolean not null default true,
  max_stake_per_bet      numeric(10,2) not null default 5.00,
  max_daily_stake_total  numeric(10,2) not null default 20.00,
  updated_at             timestamptz not null default now()
);

insert into settings (id) values (true) on conflict do nothing;

create table if not exists bankroll_ledger (
  id                bigint generated always as identity primary key,
  occurred_at       timestamptz not null default now(),
  change_amount     numeric(10,2) not null,
  balance_after     numeric(10,2) not null,
  reason            text not null check (reason in (
                      'stake_placed', 'settled_win', 'settled_loss',
                      'deposit', 'withdrawal', 'manual_adjustment'
                    )),
  bet_placement_id  bigint,
  notes             text
);

alter table settings enable row level security;
alter table bankroll_ledger enable row level security;
