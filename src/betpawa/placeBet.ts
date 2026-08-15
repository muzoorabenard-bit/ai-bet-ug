import type { Page } from "playwright";
import type { RecommendedBet } from "../db/types.js";
import { SELECTORS } from "./selectors.js";

export interface PlaceBetFlowResult {
  observedOdds: number;
  slipRef?: string;
}

const ODDS_MOVEMENT_TOLERANCE = 0.1; // abort live placement if odds moved against us by more than this

/**
 * Navigates to the given bet's slip, verifies the odds on offer, and either:
 * - dryRun=true: stops before any confirm click, returns the observed odds only.
 * - dryRun=false: clicks through to confirm and returns the slip reference.
 *
 * Throws on any unexpected state (selection not found, odds moved beyond
 * tolerance, confirmation banner missing) — the runner treats any thrown
 * error as a 'failed' placement, never a silent skip.
 */
export async function placeBetFlow(
  page: Page,
  bet: RecommendedBet,
  opts: { dryRun: boolean },
): Promise<PlaceBetFlowResult> {
  // TODO once selectors are verified: navigate to the specific match/market,
  // e.g. search for `${bet.home_team} v ${bet.away_team}` and open its page.
  await page.click(SELECTORS.betSlip.oddsButtonForSelection);

  const observedOdds = await readCurrentOdds(page);
  const movement = Math.abs(observedOdds - bet.bookmaker_odds);
  if (movement > ODDS_MOVEMENT_TOLERANCE) {
    throw new Error(
      `odds moved beyond tolerance: expected ~${bet.bookmaker_odds}, observed ${observedOdds}`,
    );
  }

  await page.fill(SELECTORS.betSlip.stakeInput, String(bet.recommended_stake));

  if (opts.dryRun) {
    return { observedOdds };
  }

  await page.click(SELECTORS.betSlip.confirmButton);
  const banner = await page.waitForSelector(SELECTORS.betSlip.confirmationBanner, { timeout: 15000 });
  const slipRef = (await banner.textContent())?.trim();

  return { observedOdds, slipRef };
}

async function readCurrentOdds(page: Page): Promise<number> {
  // TODO once selectors are verified: read the displayed odds value near the
  // selection button and parse it as a number.
  const text = await page.locator(SELECTORS.betSlip.oddsButtonForSelection).innerText();
  const value = Number.parseFloat(text);
  if (Number.isNaN(value)) throw new Error(`could not parse displayed odds from "${text}"`);
  return value;
}
