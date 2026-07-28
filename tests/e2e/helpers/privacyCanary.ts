import { expect, type Page, type Request } from "@playwright/test";
import { COPY } from "@/src/copy";

export type CaptureCanarySeeder = (page: Page, numericCanary: number) => Promise<void>;
export type PrivacyCanaryLeak = { surface: "url" | "headers" | "body"; url: string };

function containsCanary(value: string, token: string): boolean {
  let normalized = value;
  for (let pass = 0; pass < 3; pass += 1) {
    if (normalized.includes(token)) return true;
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return normalized.includes(token);
}

export function observePrivacyCanary(page: Page, token: string) {
  const observed: string[] = [];
  const leaks: PrivacyCanaryLeak[] = [];
  const inspect = (request: Request) => {
    const url = request.url();
    observed.push(url);
    const surfaces = [
      ["url", url],
      ["headers", JSON.stringify(request.headers())],
      ["body", request.postData() ?? ""],
    ] as const;
    for (const [surface, value] of surfaces) if (containsCanary(value, token)) leaks.push({ surface, url });
  };
  page.on("request", inspect);
  return { observed, leaks, stop: () => page.off("request", inspect) };
}

export async function seedCaptureCanaryThroughUi(page: Page, numericCanary: number): Promise<void> {
  const token = String(numericCanary);
  await page.goto("/capture/", { waitUntil: "networkidle" });
  const input = page.getByRole("textbox", { name: COPY.capture.inputLabel });
  await expect(input).toBeVisible();
  await input.fill(`Bottle-fed ${token} ml now`);
  await page.getByRole("button", { name: COPY.capture.parse }).click();

  const reviewedVolume = page.getByRole("spinbutton", { name: "Volume" });
  await expect(reviewedVolume).toHaveValue(token);
  await page.getByRole("button", { name: COPY.live.confirmEntries }).click();
  await expect(page.getByRole("heading", { name: COPY.live.committedTitle })).toBeVisible();

  await page.goto("/timeline/", { waitUntil: "networkidle" });
  await expect(page.getByText(`${token} ml`, { exact: true })).toBeVisible();
}

export async function exercisePrivacyCanary(page: Page, numericCanary: number, seedCapture: CaptureCanarySeeder): Promise<void> {
  const token = String(numericCanary);
  const observer = observePrivacyCanary(page, token);
  try {
    await seedCapture(page, numericCanary);
    await page.evaluate(() => fetch("/manifest.webmanifest", { headers: { "X-Privacy-Canary-Probe": "content-stays-local" } }));
    await page.reload({ waitUntil: "networkidle" });
    expect(observer.observed.length).toBeGreaterThan(0);
    expect(observer.leaks).toEqual([]);
  } finally {
    observer.stop();
  }
}
