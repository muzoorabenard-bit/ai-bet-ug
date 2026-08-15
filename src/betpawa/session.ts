import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";
import { env } from "../config/env.js";
import { SELECTORS } from "./selectors.js";

const STORAGE_STATE_PATH = "storageState/betpawa.json";

export interface BetPawaSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function openSession(): Promise<BetPawaSession> {
  const browser = await chromium.launch({ headless: env.HEADLESS });

  const hasSavedState = existsSync(STORAGE_STATE_PATH);
  const context = await browser.newContext(hasSavedState ? { storageState: STORAGE_STATE_PATH } : {});
  const page = await context.newPage();

  await page.goto(env.BETPAWA_BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4000); // client-rendered SPA needs time to hydrate

  if (!(await isLoggedIn(page))) {
    await loginFlow(page);
    await context.storageState({ path: STORAGE_STATE_PATH });
  }

  return { browser, context, page };
}

export async function closeSession(session: BetPawaSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}

/**
 * Reads the account balance from whatever page is currently loaded (the
 * "UGX 1,234.56" text near the top nav — appears unmasked on a fresh
 * page load in every case observed this session, no eye-icon click needed).
 * Used as the authoritative real-money placement signal: verified 2026-08-16
 * to match the actual stake deducted exactly, which is more reliable than
 * any single confirmation-banner selector guess.
 */
export async function readBalance(page: Page): Promise<number> {
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/UGX\s*([\d,]+\.\d{2})/);
  if (!match?.[1]) throw new Error("could not read account balance from the page");
  return Number.parseFloat(match[1].replace(/,/g, ""));
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(SELECTORS.login.loggedInMarker, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function loginFlow(page: Page): Promise<void> {
  await page.locator(SELECTORS.login.loginTrigger).first().click();
  await page.waitForSelector(SELECTORS.login.usernameInput, { timeout: 10000 });

  // The mobile number field takes the LOCAL number without the +256 prefix
  // (the prefix is a fixed label next to the input, not part of its value).
  const localPhone = env.BETPAWA_PHONE.replace(/^256/, "");
  await page.fill(SELECTORS.login.usernameInput, localPhone);
  await page.fill(SELECTORS.login.passwordInput, env.BETPAWA_PASSWORD);
  await page.click(SELECTORS.login.submitButton);
  await page.waitForSelector(SELECTORS.login.loggedInMarker, { timeout: 15000 });
}
