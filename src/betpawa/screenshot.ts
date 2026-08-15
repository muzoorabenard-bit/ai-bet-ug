import type { Page } from "playwright";

export async function captureConfirmation(page: Page, betPlacementId: number): Promise<string> {
  const path = `screenshots/placement-${betPlacementId}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}
