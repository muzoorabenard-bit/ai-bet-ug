import type { Page } from "playwright";
import type { RecommendedBet } from "../db/types.js";
import { SELECTORS } from "./selectors.js";
import { findMarketCardButtons } from "./marketCard.js";

export interface PlaceBetFlowResult {
  observedOdds: number;
  slipRef?: string;
}

const ODDS_MOVEMENT_TOLERANCE = 0.1; // abort live placement if odds moved against us by more than this

// Maps recommended_bets.selection to the exact label BetPawa shows on the
// button, per market. Double Chance/BTTS/Over-Under selections already match
// BetPawa's own labels 1:1 (chosen that way in analyze-matches's bridge
// code); only 1X2's Home/Draw/Away needs translating to 1/X/2.
const SELECTION_LABELS: Record<string, Record<string, string>> = {
  "1X2": { Home: "1", Draw: "X", Away: "2" },
  "Double Chance": { "1X": "1X", X2: "X2", "12": "12" },
  BTTS: { Yes: "Yes", No: "No" },
  "Over/Under 2.5": { "Over 2.5": "Over 2.5", "Under 2.5": "Under 2.5" },
};

/**
 * Navigates to the given bet's match page, locates the right market card and
 * selection button, verifies the odds on offer, and either:
 * - dryRun=true: stops before any confirm click, returns the observed odds only.
 * - dryRun=false: clicks through to confirm and returns the slip reference.
 *
 * Throws on any unexpected state (unsupported market, selection not found,
 * odds moved beyond tolerance, confirmation banner missing) — the runner
 * treats any thrown error as a 'failed' placement, never a silent skip.
 */
export async function placeBetFlow(
  page: Page,
  bet: RecommendedBet,
  opts: { dryRun: boolean },
): Promise<PlaceBetFlowResult> {
  const heading = (SELECTORS.marketHeadings as Record<string, string>)[bet.market];
  if (!heading) {
    throw new Error(`unsupported market '${bet.market}' — no known BetPawa market heading`);
  }
  const labelMap = SELECTION_LABELS[bet.market];
  const wantedLabel = labelMap?.[bet.selection];
  if (!wantedLabel) {
    throw new Error(`unrecognized selection '${bet.selection}' for market '${bet.market}'`);
  }
  if (!bet.bookmaker_event_url) {
    throw new Error("recommended_bets.bookmaker_event_url is not set — cannot navigate to the match");
  }

  // Match pages stream live odds continuously (websocket/polling), so
  // "networkidle" never fires here — domcontentloaded + a fixed wait instead.
  await page.goto(bet.bookmaker_event_url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  const buttons = await findMarketCardButtons(page, heading);
  if (!buttons) {
    throw new Error(`could not locate the "${heading}" market card on the match page`);
  }
  const target = buttons.find((b) => b.label === wantedLabel);
  if (!target) {
    throw new Error(`could not find selection '${wantedLabel}' within the "${heading}" market card`);
  }

  const observedOdds = Number.parseFloat(target.odds);
  if (Number.isNaN(observedOdds)) {
    throw new Error(`could not parse odds "${target.odds}"`);
  }

  // bookmaker_odds is null for picks sourced from Project Pi (no real odds
  // available at prediction time) — only compare when we actually have a
  // reference to compare against.
  if (bet.bookmaker_odds !== null) {
    const movement = Math.abs(observedOdds - bet.bookmaker_odds);
    if (movement > ODDS_MOVEMENT_TOLERANCE) {
      throw new Error(
        `odds moved beyond tolerance: expected ~${bet.bookmaker_odds}, observed ${observedOdds}`,
      );
    }
  }

  await page.locator(`[data-test-id="${target.dataTestId}"]`).click();
  await page.waitForSelector(SELECTORS.betSlip.stakeInput, { timeout: 10000 });
  await page.fill(SELECTORS.betSlip.stakeInput, String(bet.recommended_stake));

  if (opts.dryRun) {
    return { observedOdds };
  }

  await page.click(SELECTORS.betSlip.confirmButton);
  const banner = await page.waitForSelector(SELECTORS.betSlip.confirmationBanner, { timeout: 15000 });
  const slipRef = (await banner.textContent())?.trim();

  return { observedOdds, slipRef };
}
