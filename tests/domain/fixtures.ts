import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import { addMinutes, wallClockForInstant } from "@/src/domain/time";

export type FeedEvent = Extract<CareEvent, { type: "feed" }>;
export function feedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
  const startedAt = "2026-07-28T03:00:00.000Z";
  return CareEventSchema.parse({ id: "event-feed-0001", householdId: "house-1", babyId: "baby-1", type: "feed", startedAt, endedAt: addMinutes(startedAt, 20), timeZone: "America/Los_Angeles", enteredWallClock: wallClockForInstant(startedAt, "America/Los_Angeles"), fields: { mode: "bottle", volume: 3, unit: "oz", contents: "breastmilk" }, createdAt: startedAt, updatedAt: startedAt, deletedAt: null, schemaVersion: 1, captureMethod: "typed", provenance: "real", ...overrides }) as FeedEvent;
}