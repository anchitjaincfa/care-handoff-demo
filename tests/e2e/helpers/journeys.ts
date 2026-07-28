import { expect, type BrowserContext, type Page } from "@playwright/test";

export const JOURNEY_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;

export const OFFLINE_CARE_ROUTES = [
  { path: "/today/", heading: /today|care day|good (?:morning|afternoon|evening)/i },
  { path: "/timeline/", heading: /timeline|care record/i },
  { path: "/capture/", heading: /what happened|check every detail|entry saved/i },
  { path: "/pass/#demo", heading: /handoff pass|shift briefing|no handoff pass|cannot be opened|past.*expiry/i },
] as const;

export async function completeCaptureJourney(page: Page, note: string): Promise<void> {
  await page.goto("/capture/");
  await page.getByRole("textbox", { name: /care note/i }).fill(note);
  await page.getByRole("button", { name: /review this entr(?:y|ies)/i }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /confirm reviewed entr(?:y|ies)/i }).click();
  await expect(page.getByRole("heading", { name: /entry saved/i })).toBeVisible();
}

export async function stopActiveTimerJourney(page: Page): Promise<void> {
  await page.goto("/today/");
  const stop = page.getByRole("button", { name: /stop timer/i }).first();
  if (await stop.count() === 0) {
    await page.getByRole("button", { name: /start timer/i }).first().click();
  }
  await expect(page.getByRole("button", { name: /stop timer/i }).first()).toBeEnabled();
  await page.getByRole("button", { name: /stop timer/i }).first().click();
  await expect(page.getByText(/no timers are active/i)).toBeVisible();
}

export async function createHandoffJourney(page: Page): Promise<void> {
  await page.goto("/handoff/");
  await page.getByRole("button", { name: /create qr pass/i }).click();
  const consent = page.getByRole("dialog", { name: /create a shareable copy/i });
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: /create qr pass/i }).click();
  const qr = page.getByRole("img", { name: /scannable handoff qr code/i });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/i);
}

export async function deleteEverythingJourney(page: Page): Promise<void> {
  await page.goto("/privacy/");
  await page.getByRole("button", { name: /^delete everything$/i }).click();
  const confirmation = page.getByRole("dialog", { name: /permanently delete this device.*family data/i });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("textbox", { name: /type delete to confirm/i }).fill("DELETE");
  await confirmation.getByRole("button", { name: /^delete everything$/i }).click();
  await expect(page.getByText(/saved on this device|deleted|removed/i).first()).toBeVisible();
}

export async function verifyOfflineCareRoutes(context: BrowserContext, page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    for (const route of OFFLINE_CARE_ROUTES) {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response, `service worker returned no response for ${route.path}`).not.toBeNull();
      expect(response?.status(), `${route.path} must not use the worker's 503 fallback`).not.toBe(503);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/^Offline$/);
    }
  } finally {
    await context.setOffline(false);
  }
}
