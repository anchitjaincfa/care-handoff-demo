import { test } from "@playwright/test";
import {
  JOURNEY_VIEWPORTS,
  completeCaptureJourney,
  createHandoffJourney,
  deleteEverythingJourney,
  stopActiveTimerJourney,
  verifyOfflineCareRoutes,
} from "./helpers/journeys";


for (const [profile, viewport] of Object.entries(JOURNEY_VIEWPORTS)) {
  test.describe(`${profile} wired care journeys`, () => {
    test.use({ viewport });
    test("capture, timer, and handoff", async ({ page }) => {
      await completeCaptureJourney(page, `Wired ${profile} capture`);
      await stopActiveTimerJourney(page);
      await createHandoffJourney(page);
    });

    test("delete and offline routes", async ({ context, page }) => {
      await deleteEverythingJourney(page);
      await verifyOfflineCareRoutes(context, page);
    });
  });
}
