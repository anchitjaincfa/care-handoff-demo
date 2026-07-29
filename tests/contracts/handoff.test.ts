import { describe, expect, it } from "vitest";
import { decodeHandoffPayload, encodeHandoffPayload } from "@/src/domain/handoff";
describe("handoff contract", () => {
  it("round trips the complete current payload", () => {
    const payload = { v: 3 as const, timeZone: "UTC", provenance: "demo" as const, generatedAt: "2026-07-28T03:30:00.000Z", expiresAt: "2026-07-28T15:30:00.000Z", babyLabel: "M", shiftStart: "2026-07-28T00:00:00.000Z", shiftEnd: "2026-07-28T03:30:00.000Z", totals: { feeds: 0, sleepSessions: 0, sleepMinutes: 0, diapers: 0, pumpingSessions: 0, pumpingMinutes: 0, solids: 0, tummyTimeSessions: 0, tummyTimeMinutes: 0 }, events: [], openTimerCount: 0 };
    expect(decodeHandoffPayload(encodeHandoffPayload(payload))).toEqual(payload);
  });
});
