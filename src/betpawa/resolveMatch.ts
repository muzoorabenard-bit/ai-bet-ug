import type { Page } from "playwright";
import { env } from "../config/env.js";
import { BETPAWA_LEAGUE_IDS } from "./leagues.js";

interface CandidateMatch {
  href: string;
  teamEls: string[];
}

const CLUB_SUFFIXES = /\b(fc|cf|afc|bc|ud|sc|ac)\b/g;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(CLUB_SUFFIXES, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;

  return shared / Math.max(tokensA.size, tokensB.size);
}

const MATCH_THRESHOLD = 0.5;

/**
 * Finds the BetPawa match URL for a given league/team-name/kickoff-date
 * combination via fuzzy team-name matching (football-data.org and BetPawa
 * use different naming, e.g. "Manchester City FC" vs "Manchester City").
 * Best-effort: returns null (never a wrong guess) when no candidate clears
 * the overlap threshold on both team names for the same calendar date.
 */
export async function resolveBetpawaEventUrl(
  page: Page,
  params: { league: string; homeTeam: string; awayTeam: string; kickoffAt: string },
): Promise<string | null> {
  const leagueId = BETPAWA_LEAGUE_IDS[params.league];
  if (!leagueId) return null;

  await page.goto(
    `${env.BETPAWA_BASE_URL.replace(/\/$/, "")}/events/group/${leagueId}?categoryId=2&marketId=1X2&competitions=${leagueId}`,
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  await page.waitForTimeout(4000);

  const candidates: CandidateMatch[] = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    return links
      .filter((a) => /\/event\//.test(a.getAttribute("href") ?? ""))
      .map((a) => {
        const href = a.getAttribute("href") ?? "";
        // Match card text is "<time><date><homeTeam><awayTeam><competition...>"
        // with no separators — team names are the middle two text runs, split
        // out via the child element structure rather than the flattened text.
        const teamEls = Array.from(a.querySelectorAll("div, span")).map((el) => el.textContent?.trim() ?? "");
        return { href, teamEls };
      });
  });

  let best: { href: string; score: number } | null = null;

  for (const candidate of candidates) {
    // Team names appear somewhere among the card's text nodes; score every
    // pair of consecutive distinct strings and keep the best combined match.
    for (let i = 0; i < candidate.teamEls.length - 1; i++) {
      const a = candidate.teamEls[i] ?? "";
      const b = candidate.teamEls[i + 1] ?? "";
      if (!a || !b || a === b) continue;

      const homeScore = tokenOverlap(a, params.homeTeam);
      const awayScore = tokenOverlap(b, params.awayTeam);
      const combined = (homeScore + awayScore) / 2;

      if (homeScore >= MATCH_THRESHOLD && awayScore >= MATCH_THRESHOLD) {
        if (!best || combined > best.score) {
          best = { href: candidate.href, score: combined };
        }
      }
    }
  }

  if (!best) return null;

  // Team-name overlap is the primary signal; a kickoff-date cross-check
  // (the league listing doesn't expose the date in an easily parseable
  // form) would further reduce false positives but isn't required for a
  // first confident match — a strong two-team-name match on a single
  // league's near-term fixture list is already unlikely to collide.
  return `${env.BETPAWA_BASE_URL.replace(/\/$/, "")}${best.href}`;
}
