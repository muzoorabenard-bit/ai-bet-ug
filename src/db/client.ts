import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service-role key: bypasses RLS, local runner only. Never ship this to a
// browser/frontend — if a frontend is added later it must use the anon key
// with real RLS policies instead.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
