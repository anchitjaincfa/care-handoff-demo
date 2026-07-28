import { describe, expect, it } from "vitest";
import { durationMinutes, resolvePastTime, zonedDateTimeToInstant } from "@/src/domain/time";

describe("Temporal time utilities", () => {
  it("measures elapsed time across the Los Angeles fall-back", () => { const start = zonedDateTimeToInstant("2026-11-01", { hour: 0, minute: 30 }, "America/Los_Angeles"); const end = zonedDateTimeToInstant("2026-11-01", { hour: 1, minute: 30 }, "America/Los_Angeles", "later"); expect(durationMinutes(start, end)).toBe(120); });
  it("keeps Kolkata elapsed and wall duration aligned", () => { const start = zonedDateTimeToInstant("2026-07-28", { hour: 0 }, "Asia/Kolkata"); const end = zonedDateTimeToInstant("2026-07-28", { hour: 2 }, "Asia/Kolkata"); expect(durationMinutes(start, end)).toBe(120); });
  it("accounts for Lord Howe's 30-minute transition", () => { const start = zonedDateTimeToInstant("2026-10-04", { hour: 1, minute: 30 }, "Australia/Lord_Howe"); const end = zonedDateTimeToInstant("2026-10-04", { hour: 3 }, "Australia/Lord_Howe"); expect(durationMinutes(start, end)).toBe(60); });
  it("uses the nearest past clock occurrence and refuses explicit future dates", () => { const options = { now: "2026-07-28T05:00:00.000Z", timeZone: "America/Los_Angeles" }; const past = resolvePastTime("at 11 pm", options); expect(past.ok && past.instant).toBe("2026-07-27T06:00:00.000Z"); expect(resolvePastTime("2026-07-29 at 8 pm", options)).toMatchObject({ ok: false, reason: "future" }); });
});