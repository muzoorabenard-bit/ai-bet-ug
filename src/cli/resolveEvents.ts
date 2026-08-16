import { openSession, closeSession } from "../betpawa/session.js";
import { resolveBetpawaEventUrl } from "../betpawa/resolveMatch.js";
import * as recommendedBets from "../db/recommendedBets.repo.js";
import { logger } from "../runner/logger.js";

async function main() {
  const pending = await recommendedBets.getMissingBookmakerEventUrl();
  if (pending.length === 0) {
    logger.info("no recommended_bets rows are missing a bookmaker_event_url");
    return;
  }

  logger.info({ count: pending.length }, "resolving BetPawa event URLs");
  const session = await openSession();

  try {
    for (const bet of pending) {
      const log = logger.child({ recommendedBetId: bet.id });
      const url = await resolveBetpawaEventUrl(session.page, {
        league: bet.league,
        homeTeam: bet.home_team,
        awayTeam: bet.away_team,
        kickoffAt: bet.kickoff_at,
      });

      if (url) {
        await recommendedBets.setBookmakerEventUrl(bet.id, url);
        log.info({ url }, "resolved");

        // Fully-autonomous mode: this is the only remaining approval step.
        // No-ops if the row wasn't (still) pending_review — e.g. someone
        // already actioned it manually.
        if (bet.auto_execute) {
          const approved = await recommendedBets.autoApprove(bet.id);
          if (approved) log.info("auto-approved");
        }
      } else {
        log.warn(
          { league: bet.league, homeTeam: bet.home_team, awayTeam: bet.away_team },
          "no confident match found — left null, needs a manual URL in Supabase Studio",
        );
      }
    }
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "resolve-events failed");
  process.exit(1);
});
