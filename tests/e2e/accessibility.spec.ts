import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exportedRoutes } from "./routes";

const themes = ["light", "dark"] as const;

for (const route of exportedRoutes()) {
  for (const theme of themes) {
    test(`${route} has no automated accessibility violations in ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(route, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      }));
      expect(summary).toEqual([]);
    });
  }
}
