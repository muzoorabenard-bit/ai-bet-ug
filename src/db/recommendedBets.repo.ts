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

export async function getMissingBookmakerEventUrl(): Promise<RecommendedBet[]> {
  const { data, error } = await supabase
    .from("recommended_bets")
    .select("*")
    .is("bookmaker_event_url", null)
    .in("status", ["pending_review", "approved"])
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch recommended_bets missing bookmaker_event_url: ${error.message}`);
  return (data ?? []) as RecommendedBet[];
}

export async function setBookmakerEventUrl(id: number, url: string): Promise<void> {
  const { error } = await supabase
    .from("recommended_bets")
    .update({ bookmaker_event_url: url, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to set bookmaker_event_url for recommended_bet ${id}: ${error.message}`);
}

/**
 * Fully-autonomous mode (2026-08-16): the human per-bet approval step is
 * gone by deliberate choice — this is the only place a bet now transitions
 * pending_review -> approved. Conditional on status still being
 * 'pending_review' at the moment of the update, so this is safe to call
 * repeatedly / concurrently. Everything downstream (Kelly abstain, stake
 * caps, drawdown breaker, kill switch, duplicate guard) is what's left to
 * catch a bad pick — there is no longer a human sanity check before this.
 */
export async function autoApprove(id: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("recommended_bets")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_review")
    .select("id");

  if (error) throw new Error(`Failed to auto-approve recommended_bet ${id}: ${error.message}`);
  return (data ?? []).length > 0;
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
