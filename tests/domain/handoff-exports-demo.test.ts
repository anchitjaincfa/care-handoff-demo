import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDemoSeed } from "@/src/domain/demoSeed";
import { createCsvProvenanceZip, eventsToCsv, EXPORT_PROVENANCE_NOTICE, parseEventImport, stringifyEventExport } from "@/src/domain/exports";
import { decodeHandoffFragment, decodeHandoffPayload, encodeHandoffFragment, encodeHandoffPayload, generateHandoffPayload, HANDOFF_ARTIFACT_BOUNDS, isHandoffExpired, summarizeHandoffPayload, type HandoffPayload } from "@/src/domain/handoff";
import { durationMinutes } from "@/src/domain/time";
import { feedEvent } from "./fixtures";

describe("handoff generation and codec", () => {
  const input = { events: [feedEvent({ endedAt: null })], provenance: "real" as const, generatedAt: "2026-07-28T05:00:00.000Z", babyLabel: "M", timeZone: "America/Los_Angeles", shiftStart: "2026-07-28T00:00:00.000Z", shiftEnd: "2026-07-28T05:00:00.000Z" };
  it("uses a count instead of leaking timer identifiers and bounds the transported QR fragment", () => { const payload = generateHandoffPayload(input); const fragment = encodeHandoffFragment(payload); expect(new TextEncoder().encode(fragment).byteLength).toBeLessThanOrEqual(HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes); expect(HANDOFF_ARTIFACT_BOUNDS).toMatchObject({ qrFragmentBytes: 1_200, urlFragmentBytes: 8_192, fragmentPrefix: "#handoff=" }); expect(payload.openTimerCount).toBe(1); expect(JSON.stringify(payload)).not.toContain("event-feed-0001"); expect(summarizeHandoffPayload(payload)).toEqual({ feeds: 1, diapers: 0, sleepMinutes: 0, openTimers: 1 }); expect(decodeHandoffFragment(fragment)).toEqual(payload); });
  it("detects corruption, raw JSON, missing fragment frames, and extra fields", () => { const payload = generateHandoffPayload(input); const bytes = encodeHandoffPayload(payload); bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1; expect(() => decodeHandoffPayload(bytes)).toThrow(); expect(() => decodeHandoffPayload(new TextEncoder().encode(JSON.stringify(payload)))).toThrow(/frame/); expect(() => decodeHandoffFragment("handoff=abc")).toThrow(/frame/); expect(() => encodeHandoffPayload({ ...payload, notes: "private" } as HandoffPayload)).toThrow(); });
  it("reports advisory expiry without making decode time-dependent", () => { const payload = generateHandoffPayload(input); expect(isHandoffExpired(payload, "2026-07-28T16:59:59.999Z")).toBe(false); expect(isHandoffExpired(payload, payload.expiresAt)).toBe(true); expect(decodeHandoffPayload(encodeHandoffPayload(payload))).toEqual(payload); });
  it("retains legacy envelope parsing but refuses to create a shareable fragment without a source time zone", () => {
    const current = generateHandoffPayload(input);
    const legacy = {
      v: 1 as const,
      provenance: current.provenance,
      generatedAt: current.generatedAt,
      expiresAt: current.expiresAt,
      babyLabel: current.babyLabel,
      shiftStart: current.shiftStart,
      shiftEnd: current.shiftEnd,
      events: current.events,
      openTimerCount: current.openTimerCount,
    };
    expect(decodeHandoffPayload(encodeHandoffPayload(legacy))).toEqual(legacy);
    expect(() => encodeHandoffFragment(legacy as never)).toThrow(/timeZone|time zone/i);
  });
});

describe("local export packaging", () => {
  it("round-trips versioned JSON and rejects provenance mismatch", () => { const events = [feedEvent()]; const json = stringifyEventExport(events, { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" }); expect(parseEventImport(json, { householdId: "house-1", provenance: "real" }).events).toEqual(events); expect(() => parseEventImport(json, { householdId: "house-1", provenance: "demo" })).toThrow(/provenance/); });
  it("packages CSV with provenance and neutralizes spreadsheet formulas", () => { const formulaEvent = feedEvent({ id: "=SUM(1,1)-event" }); const files = unzipSync(createCsvProvenanceZip([formulaEvent], { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" })); expect(strFromU8(files["events.csv"]!)).toContain("'=SUM(1,1)-event"); expect(eventsToCsv([formulaEvent], "house-1")).not.toContain("\r\n=SUM"); expect(strFromU8(files["PROVENANCE.txt"]!)).toContain(EXPORT_PROVENANCE_NOTICE); });
});

describe("deterministic demo data", () => {
  it("is repeatable, isolated, gated, and relative to an explicit anchor", () => { const first = createDemoSeed(); const second = createDemoSeed(); const shifted = createDemoSeed({ anchorInstant: "2026-08-04T12:00:00.000Z" }); expect(first).toEqual(second); expect(first.every((event) => event.provenance === "demo" && event.householdId === "demo-household")).toBe(true); expect(first.filter((event) => event.type === "feed")).toHaveLength(32); expect(first.filter((event) => event.type === "sleep")).toHaveLength(24); expect(durationMinutes(first[0]!.startedAt, shifted[0]!.startedAt)).toBe(7 * 24 * 60); });
});