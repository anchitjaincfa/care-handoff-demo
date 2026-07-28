import { expect, type BrowserContext, type Page } from "@playwright/test";
import { COPY } from "@/src/copy";

export const JOURNEY_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;

export const OFFLINE_CARE_ROUTES = ["/today/", "/timeline/", "/capture/", "/pass/#demo"] as const;

export async function completeCaptureJourney(page: Page, note: string): Promise<void> {
  await page.goto("/capture/");
  await page.getByRole("textbox", { name: COPY.capture.inputLabel }).fill(note);
  await page.getByRole("button", { name: COPY.capture.parse }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: COPY.capture.save }).click();
  await expect(page.getByRole("heading", { name: COPY.capture.savedTitle })).toBeVisible();
}

export async function stopActiveTimerJourney(page: Page): Promise<void> {
  await page.goto("/today/");
  await page.getByRole("button", { name: COPY.today.stopTimer }).click();
  await expect(page.getByText(COPY.today.timerStopped).first()).toBeVisible();
}

export async function createHandoffJourney(page: Page): Promise<void> {
  await page.goto("/handoff/");
  await page.getByRole("button", { name: COPY.handoff.generate }).click();
  await page.getByRole("button", { name: COPY.handoff.agree }).click();
  await expect(page.getByRole("img", { name: COPY.handoff.qrAlt })).toBeVisible();
}

export async function deleteEverythingJourney(page: Page): Promise<void> {
  await page.goto("/privacy/");
  const begin = page.getByRole("button", { name: /delete everything|delete all/i }).first();
  await expect(begin).toBeEnabled();
  await begin.click();
  const confirmation = page.getByRole("textbox", { name: /confirm|type delete/i });
  if (await confirmation.count()) await confirmation.fill("DELETE");
  const commit = page.getByRole("button", { name: /delete.*device|delete forever|confirm delete/i }).last();
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page.getByText(/deleted|device data.*removed/i).first()).toBeVisible();
}

export async function verifyOfflineCareRoutes(context: BrowserContext, page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    for (const route of OFFLINE_CARE_ROUTES) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main h1")).toBeVisible();
    }
  } finally {
    await context.setOffline(false);
  }
}
