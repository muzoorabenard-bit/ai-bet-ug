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

  await page.goto(env.BETPAWA_BASE_URL);

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

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(SELECTORS.login.loggedInMarker, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function loginFlow(page: Page): Promise<void> {
  await page.fill(SELECTORS.login.usernameInput, env.BETPAWA_USERNAME);
  await page.fill(SELECTORS.login.passwordInput, env.BETPAWA_PASSWORD);
  await page.click(SELECTORS.login.submitButton);
  await page.waitForSelector(SELECTORS.login.loggedInMarker, { timeout: 15000 });
}
