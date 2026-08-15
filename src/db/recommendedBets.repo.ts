import { supabase } from "./client.js";
import type { RecommendedBet, RecommendedBetStatus } from "./types.js";

export async function getApprovedActionable(): Promise<RecommendedBet[]> {
  const { data, error } = await supabase
    .from("recommended_bets")
    .select("*")
    .eq("status", "approved")
    .eq("auto_execute", true)
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch approved recommended_bets: ${error.message}`);
  return (data ?? []) as RecommendedBet[];
}

export async function getById(id: number): Promise<RecommendedBet | null> {
  const { data, error } = await supabase.from("recommended_bets").select("*").eq("id", id).maybeSingle();

  if (error) throw new Error(`Failed to fetch recommended_bet ${id}: ${error.message}`);
  return (data as RecommendedBet | null) ?? null;
}

/**
 * Conditional claim: only succeeds if the row is still 'approved' at the moment
 * of the update. Returns true if this process won the claim, false if another
 * process (or a status change) got there first.
 */
export async function claimForProcessing(id: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("recommended_bets")
    .update({ status: "picked_up", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("id");

  if (error) throw new Error(`Failed to claim recommended_bet ${id}: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function setStatus(
  id: number,
  status: RecommendedBetStatus,
  statusReason?: string,
): Promise<void> {
  const { error } = await supabase
    .from("recommended_bets")
    .update({ status, status_reason: statusReason ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update recommended_bet ${id} status: ${error.message}`);
}

export type NewRecommendedBet = Omit<
  RecommendedBet,
  "id" | "created_at" | "updated_at" | "status" | "status_reason"
> & {
  status?: RecommendedBetStatus;
};

export async function insert(bet: NewRecommendedBet): Promise<RecommendedBet> {
  const { data, error } = await supabase
    .from("recommended_bets")
    .insert({ ...bet, status: bet.status ?? "pending_review" })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to insert recommended_bet: ${error.message}`);
  return data as RecommendedBet;
}
