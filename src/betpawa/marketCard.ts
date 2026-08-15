import type { Page } from "playwright";

export interface MarketCardButton {
  label: string;
  odds: string;
  dataTestId: string;
}

/**
 * Finds the exact market card matching `headingText` (verified 2026-08-16 via
 * src/cli/reconBetSlip.ts against a real BetPawa match page) and returns all
 * of its selection buttons. The match page has many similarly-labelled cards
 * (e.g. "Over/Under | Full Time" vs "Over/Under | Arsenal FC | Full Time",
 * "Double Chance | Full Time" vs "Double Chance and Both Teams To Score |
 * Full Time") — exact heading text match plus walking up to the SMALLEST
 * ancestor containing events-odds buttons is what keeps this scoped to the
 * right card instead of a combo market or a team-specific variant.
 */
export async function findMarketCardButtons(page: Page, headingText: string): Promise<MarketCardButton[] | null> {
  return page.evaluate((wantedHeading) => {
    const all = Array.from(document.querySelectorAll("*"));
    const heading = all.find((el) => el.textContent?.trim() === wantedHeading && el.children.length <= 1);
    if (!heading) return null;

    let node: Element | null = heading;
    while (node && node !== document.body) {
      const buttons = node.querySelectorAll('[data-test-class="events-odds event-odds"]');
      if (buttons.length > 0) {
        return Array.from(buttons).map((b) => ({
          label: b.querySelector('[class*="_label_"]')?.textContent ?? "",
          odds: b.querySelector('[class*="_odds_"]')?.textContent ?? "",
          dataTestId: b.getAttribute("data-test-id") ?? "",
        }));
      }
      node = node.parentElement;
    }
    return null;
  }, headingText);
}
