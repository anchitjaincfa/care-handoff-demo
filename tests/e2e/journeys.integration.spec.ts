import { test } from "@playwright/test";
import {
  JOURNEY_VIEWPORTS,
  completeCaptureJourney,
  createHandoffJourney,
  deleteEverythingJourney,
  stopActiveTimerJourney,
  verifyOfflineCareRoutes,
} from "./helpers/journeys";

const wired = process.env.RUN_WIRED_JOURNEYS === "1";

for (const [profile, viewport] of Object.entries(JOURNEY_VIEWPORTS)) {
  test.describe(`${profile} wired care journeys`, () => {
    test.use({ viewport });
    test.skip(!wired, "Set RUN_WIRED_JOURNEYS=1 only after final controllers and delete UI are wired.");

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
