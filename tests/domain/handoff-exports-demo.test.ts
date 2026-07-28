import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDemoSeed } from "@/src/domain/demoSeed";
import { createCsvProvenanceZip, eventsToCsv, EXPORT_PROVENANCE_NOTICE, parseEventImport, stringifyEventExport } from "@/src/domain/exports";
import { decodeHandoffFragment, decodeHandoffPayload, encodeHandoffFragment, encodeHandoffPayload, generateHandoffPayload, HANDOFF_ARTIFACT_BOUNDS, isHandoffExpired, summarizeHandoffPayload, type HandoffPayload } from "@/src/domain/handoff";
import { addMinutes, durationMinutes } from "@/src/domain/time";
import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import { feedEvent } from "./fixtures";

function rawFragment(payload: HandoffPayload): string {
  let binary = "";
  for (const byte of encodeHandoffPayload(payload)) binary += String.fromCharCode(byte);
  return HANDOFF_ARTIFACT_BOUNDS.fragmentPrefix + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function eventBase(index: number, startedAt: string) {
  return { id: "launch-event-" + String(index).padStart(4, "0"), householdId: "house-1", babyId: "baby-1", startedAt, timeZone: "America/Los_Angeles", enteredWallClock: "2026-07-27T18:00:00", createdAt: startedAt, updatedAt: startedAt, deletedAt: null, schemaVersion: 1 as const, captureMethod: "manual" as const, provenance: "real" as const };
}

describe("handoff generation and codec", () => {
  const input = { events: [feedEvent({ endedAt: null })], provenance: "real" as const, generatedAt: "2026-07-28T05:00:00.000Z", babyLabel: "M", timeZone: "America/Los_Angeles", shiftStart: "2026-07-28T00:00:00.000Z", shiftEnd: "2026-07-28T05:00:00.000Z" };
  it("uses a count instead of leaking timer identifiers and bounds the transported QR fragment", () => { const payload = generateHandoffPayload(input); const fragment = encodeHandoffFragment(payload); expect(new TextEncoder().encode(fragment).byteLength).toBeLessThanOrEqual(HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes); expect(HANDOFF_ARTIFACT_BOUNDS).toMatchObject({ qrFragmentBytes: 1_200, urlFragmentBytes: 8_192, fragmentPrefix: "#handoff=" }); expect(payload.openTimerCount).toBe(1); expect(JSON.stringify(payload)).not.toContain("event-feed-0001"); expect(summarizeHandoffPayload(payload)).toEqual({ feeds: 1, diapers: 0, sleepMinutes: 0, openTimers: 1, pumpingSessions: 0, pumpingMinutes: 0, solids: 0, tummyTimeSessions: 0, tummyTimeMinutes: 0 }); expect(decodeHandoffFragment(fragment)).toEqual(payload); });
  it("projects all six launch event types without free-text metadata", () => {
    const events: CareEvent[] = [
      CareEventSchema.parse({ ...eventBase(1, "2026-07-28T00:10:00.000Z"), type: "feed", endedAt: "2026-07-28T00:25:00.000Z", fields: { mode: "bottle", durationMinutes: 15, volume: 3, unit: "oz", contents: "formula" } }),
      CareEventSchema.parse({ ...eventBase(2, "2026-07-28T00:20:00.000Z"), type: "sleep", endedAt: "2026-07-28T01:20:00.000Z", fields: { kind: "nap" } }),
      CareEventSchema.parse({ ...eventBase(3, "2026-07-28T01:25:00.000Z"), type: "diaper", fields: { kind: "both" } }),
      CareEventSchema.parse({ ...eventBase(4, "2026-07-28T01:30:00.000Z"), type: "pumping", endedAt: "2026-07-28T01:45:00.000Z", fields: { durationMinutes: 15, volume: 2, unit: "oz" } }),
      CareEventSchema.parse({ ...eventBase(5, "2026-07-28T01:50:00.000Z"), type: "solids", fields: { food: "banana" } }),
      CareEventSchema.parse({ ...eventBase(6, "2026-07-28T02:00:00.000Z"), type: "tummy-time", endedAt: "2026-07-28T02:08:00.000Z", fields: { durationMinutes: 8 } }),
    ];
    const payload = generateHandoffPayload({ ...input, events, shiftEnd: "2026-07-28T03:00:00.000Z" });
    expect(payload.events.map((event) => event.type)).toEqual(["feed", "sleep", "diaper", "pumping", "solids", "tummy-time"]);
    expect(payload.events).toMatchObject([
      { type: "feed", details: { mode: "bottle", durationMinutes: 15, volume: 3, unit: "oz", contents: "formula" } }, { type: "sleep", details: { kind: "nap" } },
      { type: "diaper", details: { kind: "both" } }, { type: "pumping", details: { durationMinutes: 15, volume: 2, unit: "oz" } },
      { type: "solids", details: { food: "banana" } }, { type: "tummy-time", details: { durationMinutes: 8 } },
    ]);
    expect(payload.totals).toEqual({ feeds: 1, sleepSessions: 1, sleepMinutes: 60, diapers: 1, pumpingSessions: 1, pumpingMinutes: 15, solids: 1, tummyTimeSessions: 1, tummyTimeMinutes: 8 });
  });
  it("keeps independent full-shift totals when recent structured events are capped", () => {
    const events = Array.from({ length: 35 }, (_, index) => { const startedAt = addMinutes("2026-07-28T00:00:00.000Z", index); return feedEvent({ id: "event-feed-" + String(index).padStart(4, "0"), startedAt, endedAt: addMinutes(startedAt, 5) }); });
    const payload = generateHandoffPayload({ ...input, events });
    expect(payload.events).toHaveLength(30);
    expect(payload.events[0]?.at).toBe("2026-07-28T00:05:00.000Z");
    expect(payload.totals.feeds).toBe(35);
    expect(summarizeHandoffPayload(payload).feeds).toBe(35);
  });
  it("detects corruption, raw JSON, missing fragment frames, and extra fields", () => { const payload = generateHandoffPayload(input); const bytes = encodeHandoffPayload(payload); bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1; expect(() => decodeHandoffPayload(bytes)).toThrow(); expect(() => decodeHandoffPayload(new TextEncoder().encode(JSON.stringify(payload)))).toThrow(/frame/); expect(() => decodeHandoffFragment("handoff=abc")).toThrow(/frame/); expect(() => encodeHandoffPayload({ ...payload, notes: "private" } as HandoffPayload)).toThrow(); });
  it("reports advisory expiry without making decode time-dependent", () => { const payload = generateHandoffPayload(input); expect(isHandoffExpired(payload, "2026-07-28T16:59:59.999Z")).toBe(false); expect(isHandoffExpired(payload, payload.expiresAt)).toBe(true); expect(decodeHandoffPayload(encodeHandoffPayload(payload))).toEqual(payload); });
  it("retains legacy envelope parsing but refuses v1 and v2 sharing", () => {
    const current = generateHandoffPayload(input);
    const legacySleep = { type: "sleep" as const, at: "2026-07-28T01:00:00.000Z", endedAt: "2026-07-28T01:30:00.000Z", details: {} };
    const common = { provenance: current.provenance, generatedAt: current.generatedAt, expiresAt: current.expiresAt, babyLabel: current.babyLabel, shiftStart: current.shiftStart, shiftEnd: current.shiftEnd, events: [legacySleep], openTimerCount: current.openTimerCount };
    const v1: HandoffPayload = { v: 1, ...common };
    const v2: HandoffPayload = { v: 2, timeZone: current.timeZone, ...common };
    expect(decodeHandoffPayload(encodeHandoffPayload(v1))).toEqual(v1);
    expect(decodeHandoffPayload(encodeHandoffPayload(v2))).toEqual(v2);
    expect(summarizeHandoffPayload(v1)).toEqual({ feeds: 0, diapers: 0, sleepMinutes: 30, openTimers: 1, pumpingSessions: 0, pumpingMinutes: 0, solids: 0, tummyTimeSessions: 0, tummyTimeMinutes: 0 });
    expect(() => encodeHandoffFragment(v1 as never)).toThrow(/complete v3/i);
    expect(() => encodeHandoffFragment(v2 as never)).toThrow(/complete v3/i);
    expect(() => decodeHandoffFragment(rawFragment(v1))).toThrow(/predates complete/i);
    expect(() => decodeHandoffFragment(rawFragment(v2))).toThrow(/predates complete/i);
  });
});

describe("local export packaging", () => {
  it("round-trips versioned JSON and rejects provenance mismatch", () => { const events = [feedEvent()]; const json = stringifyEventExport(events, { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" }); expect(parseEventImport(json, { householdId: "house-1", provenance: "real" }).events).toEqual(events); expect(() => parseEventImport(json, { householdId: "house-1", provenance: "demo" })).toThrow(/provenance/); });
  it("packages CSV with provenance and neutralizes spreadsheet formulas", () => { const formulaEvent = feedEvent({ id: "=SUM(1,1)-event" }); const files = unzipSync(createCsvProvenanceZip([formulaEvent], { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" })); expect(strFromU8(files["events.csv"]!)).toContain("'=SUM(1,1)-event"); expect(eventsToCsv([formulaEvent], "house-1")).not.toContain("\r\n=SUM"); expect(strFromU8(files["PROVENANCE.txt"]!)).toContain(EXPORT_PROVENANCE_NOTICE); });
});

describe("deterministic demo data", () => {
  it("is repeatable, isolated, gated, and relative to an explicit anchor", () => { const first = createDemoSeed(); const second = createDemoSeed(); const shifted = createDemoSeed({ anchorInstant: "2026-08-04T12:00:00.000Z" }); expect(first).toEqual(second); expect(first.every((event) => event.provenance === "demo" && event.householdId === "demo-household")).toBe(true); expect(first.filter((event) => event.type === "feed")).toHaveLength(32); expect(first.filter((event) => event.type === "sleep")).toHaveLength(24); expect(durationMinutes(first[0]!.startedAt, shifted[0]!.startedAt)).toBe(7 * 24 * 60); });
});