// Throwaway reconnaissance script — extends reconLogin.ts's approach to the
// bet-slip flow. Reuses the already-verified session/login (session.ts,
// storageState). Navigates to a real match, clicks one odds selection to
// add it to the slip, and dumps the resulting DOM elements (stake input,
// confirm button, etc.) WITHOUT ever clicking a final confirm/place button.
import { openSession, closeSession } from "../betpawa/session.js";
import { env } from "../config/env.js";

async function main() {
  const session = await openSession();
  const { page } = session;

  // Click into the first "Popular Match Combos" card's match name link to
  // reach a real match detail page.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "screenshots/betslip-01-homepage.png", fullPage: true });

  // Premier League group page (id 11965, discovered from the homepage
  // competition links) — top 5 leagues' ids: EPL=11965, Serie A=12097,
  // Bundesliga=12110, LaLiga=12039, Ligue 1=12127.
  await page.goto(
    `${env.BETPAWA_BASE_URL.replace(/\/$/, "")}/events/group/11965?categoryId=2&marketId=1X2&competitions=11965`,
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "screenshots/betslip-02-league-page.png", fullPage: true });

  const matchLinks = await page.locator("a").evaluateAll((els) =>
    els
      .map((el) => ({ href: el.getAttribute("href"), text: el.textContent?.trim().slice(0, 60) }))
      .filter((l) => l.href && /\/event\//.test(l.href ?? "")),
  );
  console.log("=== CANDIDATE MATCH LINKS ===");
  console.log(JSON.stringify(matchLinks.slice(0, 15), null, 2));

  // Open one real match (Arsenal v Coventry City) and inspect its 1X2
  // market buttons.
  const firstMatchHref = matchLinks[0]?.href;
  if (!firstMatchHref) throw new Error("no match links found");

  // Match pages stream live odds updates continuously (websocket/polling),
  // so "networkidle" never fires here — use domcontentloaded + a fixed wait.
  await page.goto(`${env.BETPAWA_BASE_URL.replace(/\/$/, "")}${firstMatchHref}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "screenshots/betslip-03-match-page.png", fullPage: true });

  // Find the exact "1X2 | Full Time" heading (not "1X2 1UP | Full Time"),
  // then walk up to the smallest ancestor that contains exactly 3
  // events-odds buttons — that's the market card, scoped correctly even
  // though the page has many similar markets.
  const cardInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    const heading = all.find((el) => el.textContent?.trim() === "1X2 | Full Time" && el.children.length <= 1);
    if (!heading) return null;

    let node: Element | null = heading;
    while (node && node !== document.body) {
      const buttons = node.querySelectorAll('[data-test-class="events-odds event-odds"]');
      if (buttons.length === 3) {
        return {
          cardClassName: typeof node.className === "string" ? node.className : undefined,
          buttons: Array.from(buttons).map((b) => ({
            label: b.querySelector('[class*="_label_"]')?.textContent,
            odds: b.querySelector('[class*="_odds_"]')?.textContent,
            dataTestId: b.getAttribute("data-test-id"),
          })),
        };
      }
      node = node.parentElement;
    }
    return null;
  });
  console.log("=== 1X2 FULL TIME MARKET CARD ===");
  console.log(JSON.stringify(cardInfo, null, 2));

  // Dump every market card's heading text + its selection labels, so
  // Double Chance / BTTS / Over-Under headings can be confirmed exactly
  // (rather than guessed) before wiring placeBet.ts's market dispatch.
  const allMarketCards = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("*")).filter(
      (el) => /\|\s*Full Time$/.test(el.textContent?.trim() ?? "") && el.children.length <= 1,
    );
    const seen = new Set<string>();
    const results: { heading: string; buttonCount: number; labels: string[] }[] = [];
    for (const heading of headings) {
      const text = heading.textContent!.trim();
      if (seen.has(text)) continue;
      let node: Element | null = heading;
      while (node && node !== document.body) {
        const buttons = node.querySelectorAll('[data-test-class="events-odds event-odds"]');
        if (buttons.length > 0 && buttons.length <= 12) {
          seen.add(text);
          results.push({
            heading: text,
            buttonCount: buttons.length,
            labels: Array.from(buttons).map((b) => b.querySelector('[class*="_label_"]')?.textContent ?? ""),
          });
          break;
        }
        node = node.parentElement;
      }
    }
    return results;
  });
  console.log("=== ALL MARKET CARDS (heading -> labels) ===");
  console.log(JSON.stringify(allMarketCards, null, 2));

  // Click the "1" (home win) selection to add it to the slip, then inspect
  // the slip panel — WITHOUT clicking any confirm/place button.
  if (cardInfo?.buttons[0]?.dataTestId) {
    await page.locator(`[data-test-id="${cardInfo.buttons[0].dataTestId}"]`).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "screenshots/betslip-04-selection-added.png", fullPage: true });

    const slipInputs = await page.locator("input").evaluateAll((els) =>
      els.map((el) => ({
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        id: el.id,
        placeholder: el.getAttribute("placeholder"),
        value: (el as HTMLInputElement).value,
      })),
    );
    console.log("=== INPUTS AFTER ADDING SELECTION (look for stake input) ===");
    console.log(JSON.stringify(slipInputs, null, 2));

    const slipButtons = await page.locator("button").evaluateAll((els) =>
      els
        .map((el) => ({
          text: el.textContent?.trim().slice(0, 40),
          type: el.getAttribute("type"),
          className: typeof el.className === "string" ? el.className.slice(0, 80) : undefined,
        }))
        .filter((b) => b.text && /place|confirm|bet now|submit/i.test(b.text)),
    );
    console.log("=== CANDIDATE CONFIRM/PLACE BUTTONS (NOT CLICKED) ===");
    console.log(JSON.stringify(slipButtons, null, 2));
  }

  await closeSession(session);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
