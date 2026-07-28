import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  IndexedDbMetricsPort,
} from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import type { MetricEntry } from "@/src/ports/MetricsPort";

function createMetrics() {
  return new IndexedDbMetricsPort(new IDBFactory());
}

describe("IndexedDbMetricsPort", () => {
  it("stores only the frozen content-free metric fields", async () => {
    const metrics = createMetrics();
    const input = {
      name: "capture_typed",
      at: "2026-07-28T08:30:00.000Z",
      durationMs: 250,
      note: "content that must never enter the ledger",
      subjectName: "also content",
    } as MetricEntry;

    await metrics.record(input);

    expect(await metrics.list()).toEqual([{
      name: "capture_typed",
      at: "2026-07-28T08:30:00.000Z",
      durationMs: 250,
    }]);
  });

  it("exports only after an explicit export call and can clear the ledger", async () => {
    const metrics = createMetrics();
    await metrics.record({ name: "handoff_generated", at: "2026-07-28T09:00:00.000Z" });

    expect(JSON.parse(await metrics.exportJson())).toEqual({
      schemaVersion: 1,
      entries: [{ name: "handoff_generated", at: "2026-07-28T09:00:00.000Z" }],
    });

    await metrics.clear();
    expect(await metrics.list()).toEqual([]);
  });

  it("rejects content-bearing or malformed metrics at the boundary", async () => {
    const metrics = createMetrics();
    await expect(metrics.record({
      name: "unknown_metric",
      at: "not-a-time",
    } as unknown as MetricEntry)).rejects.toThrow("Unknown metric name");
  });
});
