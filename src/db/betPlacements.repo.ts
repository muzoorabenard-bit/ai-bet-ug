import { supabase } from "./client.js";
import type { BetPlacement, BetPlacementStatus } from "./types.js";

export async function countActivePlacements(recommendedBetId: number): Promise<number> {
  const { count, error } = await supabase
    .from("bet_placements")
    .select("id", { count: "exact", head: true })
    .eq("recommended_bet_id", recommendedBetId)
    .in("status", ["in_progress", "success", "dry_run_success"]);

  if (error) throw new Error(`Failed to count active placements: ${error.message}`);
  return count ?? 0;
}

export async function sumPlacedStakeToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("bet_placements")
    .select("stake_placed")
    .eq("status", "success")
    .gte("started_at", startOfDay.toISOString());

  if (error) throw new Error(`Failed to sum today's placed stake: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + (Number(row.stake_placed) || 0), 0);
}

export async function nextAttemptNumber(recommendedBetId: number): Promise<number> {
  const { data, error } = await supabase
    .from("bet_placements")
    .select("attempt_number")
    .eq("recommended_bet_id", recommendedBetId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to compute next attempt number: ${error.message}`);
  return (data?.attempt_number ?? 0) + 1;
}

export async function startPlacement(params: {
  recommendedBetId: number;
  attemptNumber: number;
  dryRun: boolean;
}): Promise<BetPlacement> {
  // This insert is what the DB's partial unique index protects: it will
  // reject a second concurrent/successful placement for the same bet.
  const { data, error } = await supabase
    .from("bet_placements")
    .insert({
      recommended_bet_id: params.recommendedBetId,
      attempt_number: params.attemptNumber,
      dry_run: params.dryRun,
      status: "in_progress",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to start bet_placement: ${error.message}`);
  return data as BetPlacement;
}

export async function completePlacement(
  id: number,
  update: Partial<
    Pick<
      BetPlacement,
      | "status"
      | "submitted_odds"
      | "stake_placed"
      | "bookmaker_slip_ref"
      | "screenshot_path"
      | "error_message"
      | "kelly_fraction_applied"
    >
  > & { status: BetPlacementStatus },
): Promise<void> {
  const { error } = await supabase
    .from("bet_placements")
    .update({ ...update, completed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to complete bet_placement ${id}: ${error.message}`);
}
