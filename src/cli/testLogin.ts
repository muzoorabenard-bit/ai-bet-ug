// Throwaway verification script — confirms session.ts's real login flow
// (not the reconnaissance script, the actual production code path) works
// end-to-end, and that storageState persists so a second run skips login.
import { openSession, closeSession } from "../betpawa/session.js";

async function main() {
  console.log("Opening session (will log in if no storageState saved)...");
  const session = await openSession();
  console.log("Session open — login succeeded (or storageState was reused).");
  await closeSession(session);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
