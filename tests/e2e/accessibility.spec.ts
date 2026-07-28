import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exportedRoutes } from "./routes";

const themes = ["light", "dark"] as const;
const acceptedBaseline = new Map<string, ReadonlySet<string>>([
  ["/|light", new Set([
    'color-contrast:[".eyebrow"]',
  ])],
]);

for (const route of exportedRoutes()) {
  for (const theme of themes) {
    test(`${route} has no accessibility regressions in ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(route, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page }).analyze();
      const accepted = acceptedBaseline.get(`${route}|${theme}`) ?? new Set<string>();
      const unexpected = results.violations.flatMap((violation) => {
        const nodes = violation.nodes.filter((node) => {
          const fingerprint = `${violation.id}:${JSON.stringify(node.target)}`;
          return !accepted.has(fingerprint);
        });
        return nodes.length ? [{
          id: violation.id,
          impact: violation.impact,
          nodes: nodes.map((node) => node.target),
        }] : [];
      });
      expect(unexpected).toEqual([]);
    });
  }
}
