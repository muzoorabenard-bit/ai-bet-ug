import { supabase } from "./client.js";
import type { BankrollLedgerEntry } from "./types.js";

export async function getCurrentBalance(): Promise<number> {
  const { data, error } = await supabase.from("settings").select("current_bankroll").eq("id", true).single();

  if (error) throw new Error(`Failed to fetch current bankroll: ${error.message}`);
  return data?.current_bankroll ?? 0;
}

/**
 * The only legal way to change the bankroll or append a ledger entry — both
 * happen atomically inside append_bankroll_entry() (see migration 0005),
 * which locks the settings singleton row so concurrent writers (this repo,
 * and project-pi's settlement function) serialize instead of racing.
 */
export async function appendEntry(params: {
  changeAmount: number;
  reason: BankrollLedgerEntry["reason"];
  betPlacementId?: number;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("append_bankroll_entry", {
    p_change: params.changeAmount,
    p_reason: params.reason,
    p_bet_placement_id: params.betPlacementId ?? null,
    p_notes: params.notes ?? null,
  });

  if (error) throw new Error(`Failed to append bankroll_ledger entry: ${error.message}`);
}
