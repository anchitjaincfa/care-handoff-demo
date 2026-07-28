import { describe, expect, it } from "vitest";
import { buildRoutineWindow, predictNextEventWindow } from "@/src/domain/insights";
import { addMinutes } from "@/src/domain/time";
import { feedEvent } from "./fixtures";

function observations(count: number) { const origin = "2026-07-20T00:00:00.000Z"; return Array.from({ length: count }, (_, index) => { const startedAt = addMinutes(origin, index * 180); return feedEvent({ id: `insight-feed-${index.toString().padStart(3, "0")}`, startedAt, endedAt: addMinutes(startedAt, 20), createdAt: startedAt, updatedAt: startedAt }); }); }
describe("descriptive routine and prediction gates", () => {
  it("suppresses windows below 21 complete samples", () => { expect(buildRoutineWindow(observations(20), "feed", "2026-07-23T00:00:00.000Z", "Asia/Kolkata")).toMatchObject({ status: "forming", sampleCount: 20, requiredSamples: 21 }); expect(predictNextEventWindow(observations(20), "feed", "2026-07-23T00:00:00.000Z")).toMatchObject({ status: "forming" }); });
  it("returns factual ranges at the gate", () => { const routine = buildRoutineWindow(observations(21), "feed", "2026-07-23T00:00:00.000Z", "America/Los_Angeles"); const prediction = predictNextEventWindow(observations(21), "feed", "2026-07-23T00:00:00.000Z"); expect(routine).toMatchObject({ status: "ready", sampleCount: 21 }); expect(prediction).toMatchObject({ status: "ready", sampleCount: 21, medianIntervalMinutes: 180 }); if (prediction.status === "ready") expect(prediction.windowStart <= prediction.windowEnd).toBe(true); });
  it("excludes deleted and open interval records from the sample count", () => { const records = observations(21); records[0] = { ...records[0]!, deletedAt: records[0]!.updatedAt }; records[1] = { ...records[1]!, endedAt: null }; expect(buildRoutineWindow(records, "feed", "2026-07-23T00:00:00.000Z", "America/Los_Angeles")).toMatchObject({ status: "forming", sampleCount: 19 }); });
});