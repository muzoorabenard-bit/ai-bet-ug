import { insert } from "../db/recommendedBets.repo.js";
import { logger } from "../runner/logger.js";

async function main() {
  const kickoff = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  const bet = await insert({
    league: "EPL",
    home_team: "Arsenal",
    away_team: "Chelsea",
    kickoff_at: kickoff.toISOString(),
    market: "1X2",
    selection: "Home",
    // A real positive edge vs the stub client's fake odds (bookmaker_odds),
    // so the Kelly stake-sizing path actually produces a stake instead of
    // abstaining — see src/guardrails/kelly.ts.
    model_odds: 1 / 0.55,
    model_probability: 0.55,
    bookmaker_odds: 2.1,
    edge_pct: 7.4,
    recommended_stake: 2,
    auto_execute: true,
    dry_run: true,
    source: "stub",
    bookmaker_event_url: null,
    pi_match_id: null,
  });

  logger.info(
    { id: bet.id },
    `seeded fake recommended_bet #${bet.id} with status='pending_review' — flip it to 'approved' in Supabase Studio before running run-once`,
  );
}

main().catch((err) => {
  logger.error({ err }, "seed-fake-bet failed");
  process.exit(1);
});
