import { supabase } from "./client.js";
import type { BankrollLedgerEntry } from "./types.js";

export async function getCurrentBalance(): Promise<number> {
  const { data, error } = await supabase
    .from("bankroll_ledger")
    .select("balance_after")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch bankroll balance: ${error.message}`);
  return data?.balance_after ?? 0;
}

export async function appendEntry(params: {
  changeAmount: number;
  reason: BankrollLedgerEntry["reason"];
  betPlacementId?: number;
  notes?: string;
}): Promise<void> {
  const currentBalance = await getCurrentBalance();
  const balanceAfter = currentBalance + params.changeAmount;

  const { error } = await supabase.from("bankroll_ledger").insert({
    change_amount: params.changeAmount,
    balance_after: balanceAfter,
    reason: params.reason,
    bet_placement_id: params.betPlacementId ?? null,
    notes: params.notes ?? null,
  });

  if (error) throw new Error(`Failed to append bankroll_ledger entry: ${error.message}`);
}
