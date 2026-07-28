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
      await completeCaptureJourney(page, "Fed 3 oz at 8 pm then changed a wet diaper 10 minutes ago");
      await stopActiveTimerJourney(page);
      await createHandoffJourney(page);
    });

    test("offline routes and deletion", async ({ context, page }) => {
      await verifyOfflineCareRoutes(context, page);
      await deleteEverythingJourney(page);
    });
  });
}
