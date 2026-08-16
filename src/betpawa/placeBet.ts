import type { Page } from "playwright";
import type { RecommendedBet } from "../db/types.js";
import { SELECTORS } from "./selectors.js";
import { findMarketCardButtons } from "./marketCard.js";
import { readBalance } from "./session.js";
import { AbstainError, type ResolveStake } from "./types.js";

export interface PlaceBetFlowResult {
  observedOdds: number;
  stake: number;
  kellyFractionApplied?: number;
  slipRef?: string;
}

const ODDS_MOVEMENT_TOLERANCE = 0.1; // abort live placement if odds moved against us by more than this

// Maps recommended_bets.selection to the exact label BetPawa shows on the
// button, per market. Double Chance/BTTS selections already match BetPawa's
// own labels 1:1 (chosen that way in analyze-matches's bridge code); only
// 1X2's Home/Draw/Away needs translating to 1/X/2.
//
// "Over/Under 2.5" is deliberately absent — retired from auto-placement as
// too risky. A market missing from this map falls through to placeBetFlow's
// "unsupported market" error (a 'failed' placement, not a silent bet), so
// this also fails closed if such a row ever somehow reaches this point.
const SELECTION_LABELS: Record<string, Record<string, string>> = {
  "1X2": { Home: "1", Draw: "X", Away: "2" },
  "Double Chance": { "1X": "1X", X2: "X2", "12": "12" },
  BTTS: { Yes: "Yes", No: "No" },
};

/**
 * Navigates to the given bet's match page, locates the right market card and
 * selection button, verifies the odds on offer, resolves the real stake via
 * the injected callback (Kelly sizing happens in processBet.ts, not here —
 * see resolveStake's doc comment in betpawa/types.ts), and either:
 * - dryRun=true: stops before any confirm click, returns the observed odds/stake only.
 * - dryRun=false: clicks through to confirm and returns the slip reference.
 *
 * Throws AbstainError when resolveStake declines (no edge / guardrail
 * blocked) — the runner treats that as a deliberate skip, not a failure.
 * Throws a plain Error on any unexpected state (unsupported market,
 * selection not found, odds moved beyond tolerance, balance didn't move as
 * expected) — the runner treats that as a 'failed' placement.
 */
export async function placeBetFlow(
  page: Page,
  bet: RecommendedBet,
  opts: { dryRun: boolean; resolveStake: ResolveStake },
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

  const stakeDecision = await opts.resolveStake(observedOdds);
  if (stakeDecision.abstain) {
    throw new AbstainError(stakeDecision.reason);
  }
  const { stake, kellyFractionApplied } = stakeDecision;

  await page.locator(`[data-test-id="${target.dataTestId}"]`).click();
  await page.waitForSelector(SELECTORS.betSlip.stakeInput, { timeout: 10000 });
  await page.fill(SELECTORS.betSlip.stakeInput, String(stake));

  if (opts.dryRun) {
    return { observedOdds, stake, kellyFractionApplied };
  }

  // Balance delta is the authoritative success/failure signal, not any
  // single confirmation-banner selector — verified 2026-08-16 to match the
  // real stake deducted exactly (a banner-only check silently missed a
  // real, successful placement because the selector guess was wrong: the
  // click went through, the money moved, and the code still reported
  // 'failed'). A banner match is still attempted below purely as a
  // best-effort bonus for the slip reference; it never blocks success.
  const balanceBefore = await readBalance(page);
  await page.click(SELECTORS.betSlip.confirmButton);
  await page.waitForTimeout(3000);
  const balanceAfter = await readBalance(page);

  const actualDeducted = balanceBefore - balanceAfter;
  if (Math.abs(actualDeducted - stake) > 0.01) {
    throw new Error(
      `balance did not decrease by the expected stake after clicking confirm — expected -${stake}, ` +
        `observed ${(-actualDeducted).toFixed(2)} (balance ${balanceBefore} -> ${balanceAfter}). ` +
        `Check BetPawa "My Bets" manually before any retry — the click may or may not have gone through.`,
    );
  }

  let slipRef: string | undefined;
  try {
    const banner = await page.waitForSelector(SELECTORS.betSlip.confirmationBanner, { timeout: 5000 });
    slipRef = (await banner.textContent())?.trim();
  } catch {
    // No banner match — not an error. Success is already confirmed above via
    // the balance delta; the real slip id is visible in BetPawa's "My Bets".
  }

  return { observedOdds, stake, kellyFractionApplied, slipRef };
}
