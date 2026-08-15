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
