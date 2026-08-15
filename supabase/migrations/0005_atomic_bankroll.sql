-- bankroll.repo.ts's appendEntry() previously did a non-atomic read-then-
-- write (SELECT latest balance_after, then INSERT balance+change). Safe with
-- a single writer (the poll loop), but the settlement pipeline (project-pi,
-- a separate scheduled process) becomes a second concurrent writer to
-- bankroll_ledger. This function is the only legal way to write it from now
-- on: the settings singleton row's UPDATE takes a row lock, so concurrent
-- callers serialize for free — no new locking primitives needed.

alter table settings
  add column if not exists current_bankroll numeric(10,2) not null default 0;

update settings
  set current_bankroll = coalesce(
    (select balance_after from bankroll_ledger order by occurred_at desc limit 1),
    0
  )
  where id = true;

create or replace function append_bankroll_entry(
  p_change numeric,
  p_reason text,
  p_bet_placement_id bigint,
  p_notes text
) returns numeric
language plpgsql
as $$
declare
  v_new_balance numeric;
begin
  update settings
    set current_bankroll = current_bankroll + p_change,
        updated_at = now()
    where id = true
    returning current_bankroll into v_new_balance;

  insert into bankroll_ledger (change_amount, balance_after, reason, bet_placement_id, notes)
    values (p_change, v_new_balance, p_reason, p_bet_placement_id, p_notes);

  return v_new_balance;
end;
$$;
