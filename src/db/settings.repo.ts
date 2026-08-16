import { supabase } from "./client.js";
import type { Settings } from "./types.js";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").eq("id", true).single();

  if (error) throw new Error(`Failed to load settings: ${error.message}`);
  if (!data) throw new Error("settings row missing — did migrations/seed run?");

  return data as Settings;
}

export async function setKillSwitch(on: boolean): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .update({ kill_switch: on, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) throw new Error(`Failed to update kill switch: ${error.message}`);
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * If the current week has elapsed, resets the baseline (week_start_at=now,
 * week_start_bankroll=current balance) and returns the updated settings.
 * Otherwise returns settings unchanged. Called once per poll cycle
 * (pollLoop.ts) — if the runner is offline for days, this self-heals with a
 * single catch-up rollover the moment it resumes, which is fine since no
 * bets are being placed while it's offline regardless.
 */
export async function rolloverWeekIfDue(settings: Settings): Promise<Settings> {
  const weekStartedAt = new Date(settings.week_start_at).getTime();
  if (Date.now() - weekStartedAt < ONE_WEEK_MS) {
    return settings;
  }

  const { data, error } = await supabase
    .from("settings")
    .update({
      week_start_at: new Date().toISOString(),
      week_start_bankroll: settings.current_bankroll,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to roll over week: ${error.message}`);
  return data as Settings;
}

/**
 * Trips the kill switch due to a weekly drawdown breach. Guarded so it's a
 * no-op once already tripped — avoids churning updated_at/log spam every
 * poll cycle while the breaker stays tripped. The caller is responsible for
 * logging why.
 */
export async function tripKillSwitchForDrawdown(): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .update({ kill_switch: true, updated_at: new Date().toISOString() })
    .eq("id", true)
    .eq("kill_switch", false);

  if (error) throw new Error(`Failed to trip kill switch for drawdown: ${error.message}`);
}
