// Throwaway reconnaissance script — NOT part of the runner. Opens BetPawa,
// takes a screenshot, and dumps candidate login-related elements (inputs,
// buttons, links containing "log in"/"sign in") so real selectors can be
// identified before writing/testing the actual login flow. Does not submit
// any credentials.
import { chromium } from "playwright";
import { env } from "../config/env.js";

async function main() {
  const browser = await chromium.launch({ headless: env.HEADLESS });
  const page = await browser.newPage();

  await page.goto(env.BETPAWA_BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4000); // let client-side rendering settle

  await page.screenshot({ path: "screenshots/recon-01-homepage.png", fullPage: true });

  const inputs = await page.locator("input").evaluateAll((els) =>
    els.map((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id,
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
    })),
  );

  const buttons = await page.locator("button, a[role=button], a").evaluateAll((els) =>
    els
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 40),
        id: el.id,
        className: typeof el.className === "string" ? el.className.slice(0, 80) : undefined,
      }))
      .filter((b) => b.text && /log\s*in|sign\s*in|login/i.test(b.text)),
  );

  console.log("=== INPUTS ON HOMEPAGE ===");
  console.log(JSON.stringify(inputs, null, 2));
  console.log("=== LOGIN-LIKE BUTTONS/LINKS ===");
  console.log(JSON.stringify(buttons, null, 2));

  // Click the navbar "Login" link/button to reveal the login form.
  await page.getByText("Login", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/recon-02-login-form.png", fullPage: true });

  const loginInputs = await page.locator("input").evaluateAll((els) =>
    els.map((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id,
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
      autocomplete: el.getAttribute("autocomplete"),
    })),
  );

  const loginButtons = await page.locator("button").evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent?.trim().slice(0, 40),
      type: el.getAttribute("type"),
      className: typeof el.className === "string" ? el.className.slice(0, 80) : undefined,
    })),
  );

  console.log("=== INPUTS AFTER CLICKING LOGIN ===");
  console.log(JSON.stringify(loginInputs, null, 2));
  console.log("=== BUTTONS AFTER CLICKING LOGIN ===");
  console.log(JSON.stringify(loginButtons, null, 2));

  // The form asks for the mobile number WITHOUT the +256 country code
  // (it's shown as a fixed prefix next to the input).
  const localPhone = env.BETPAWA_PHONE.replace(/^256/, "");
  await page.fill('input[name="username"]', localPhone);
  await page.fill('input[name="password"]', env.BETPAWA_PASSWORD);
  await page.screenshot({ path: "screenshots/recon-03-filled.png", fullPage: true });

  await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "screenshots/recon-04-after-submit.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  console.log("=== VISIBLE PAGE TEXT SNIPPET AFTER SUBMIT (first 1500 chars) ===");
  console.log(bodyText.slice(0, 1500));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
