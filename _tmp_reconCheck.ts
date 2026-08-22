import { chromium } from "playwright";
import { env } from "./src/config/env.js";

async function main() {
  const browser = await chromium.launch({ headless: env.HEADLESS });
  const page = await browser.newPage();
  await page.goto(env.BETPAWA_BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);
  const bodyLen = (await page.locator("body").innerText().catch(() => "")).length;
  console.log("body text length:", bodyLen, "(healthy homepage should be 1000+)");
  await page.screenshot({ path: "screenshots/recon-home-recheck.png" });
  await browser.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
