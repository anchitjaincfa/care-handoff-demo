import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDemoSeed } from "@/src/domain/demoSeed";
import { createCsvProvenanceZip, EXPORT_PROVENANCE_NOTICE, parseEventImport, stringifyEventExport } from "@/src/domain/exports";
import { decodeHandoffFragment, decodeHandoffPayload, encodeHandoffFragment, encodeHandoffPayload, generateHandoffPayload, summarizeHandoffPayload, type HandoffPayload } from "@/src/domain/handoff";
import { feedEvent } from "./fixtures";

describe("handoff generation and codec", () => {
  const input = { events: [feedEvent({ endedAt: null })], provenance: "real" as const, generatedAt: "2026-07-28T05:00:00.000Z", babyLabel: "M", shiftStart: "2026-07-28T00:00:00.000Z", shiftEnd: "2026-07-28T05:00:00.000Z" };
  it("generates an expiring whitelisted payload within the QR ceiling", () => { const payload = generateHandoffPayload(input); const bytes = encodeHandoffPayload(payload); expect(bytes.byteLength).toBeLessThanOrEqual(1_200); expect(payload.expiresAt).toBe("2026-07-28T17:00:00.000Z"); expect(payload.openTimerIds).toEqual(["event-feed-0001"]); expect(summarizeHandoffPayload(payload)).toEqual({ feeds: 1, diapers: 0, sleepMinutes: 0, openTimers: 1 }); expect(decodeHandoffFragment(encodeHandoffFragment(payload))).toEqual(payload); });
  it("detects corruption and rejects fields outside the pass whitelist", () => { const payload = generateHandoffPayload(input); const bytes = encodeHandoffPayload(payload); bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1; expect(() => decodeHandoffPayload(bytes)).toThrow(); expect(() => encodeHandoffPayload({ ...payload, notes: "private" } as HandoffPayload)).toThrow(); });
});

describe("local export packaging", () => {
  it("round-trips versioned JSON and rejects provenance mismatch", () => { const events = [feedEvent()]; const json = stringifyEventExport(events, { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" }); expect(parseEventImport(json, { householdId: "house-1", provenance: "real" }).events).toEqual(events); expect(() => parseEventImport(json, { householdId: "house-1", provenance: "demo" })).toThrow(/provenance/); });
  it("packages CSV with the required provenance notice", () => { const files = unzipSync(createCsvProvenanceZip([feedEvent()], { householdId: "house-1", generatedAt: "2026-07-28T05:00:00.000Z" })); expect(strFromU8(files["events.csv"]!)).toContain("event-feed-0001"); expect(strFromU8(files["PROVENANCE.txt"]!)).toContain(EXPORT_PROVENANCE_NOTICE); });
});

describe("deterministic demo data", () => {
  it("is repeatable, isolated, and sufficient for gated feed/sleep examples", () => { const first = createDemoSeed(); const second = createDemoSeed(); expect(first).toEqual(second); expect(first.every((event) => event.provenance === "demo" && event.householdId === "demo-household")).toBe(true); expect(first.filter((event) => event.type === "feed")).toHaveLength(32); expect(first.filter((event) => event.type === "sleep")).toHaveLength(24); });
});