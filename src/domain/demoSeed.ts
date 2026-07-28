import { Temporal } from "@js-temporal/polyfill";
import { CareEventSchema, type CareEvent } from "./types";
import { wallClockForInstant, zonedDateTimeToInstant } from "./time";

export type DemoSeedOptions = { householdId?: string; babyId?: string; timeZone?: string; anchorInstant?: string; startDate?: string; days?: number };
export function createDemoSeed(options: DemoSeedOptions = {}): CareEvent[] {
  const householdId = options.householdId ?? "demo-household"; const babyId = options.babyId ?? "demo-baby"; const timeZone = options.timeZone ?? "America/Los_Angeles"; const days = options.days ?? 8;
  const anchorInstant = Temporal.Instant.from(options.anchorInstant ?? "2026-07-28T12:00:00.000Z"); const anchorDate = anchorInstant.toZonedDateTimeISO(timeZone).toPlainDate(); const startDate = Temporal.PlainDate.from(options.startDate ?? anchorDate.subtract({ days }).toString()); const events: CareEvent[] = [];
  const instant = (day: number, hour: number, minute = 0, extraDays = 0) => zonedDateTimeToInstant(startDate.add({ days: day + extraDays }).toString(), { hour, minute }, timeZone);
  const base = (id: string, startedAt: string) => ({ id, householdId, babyId, startedAt, timeZone, enteredWallClock: wallClockForInstant(startedAt, timeZone), createdAt: startedAt, updatedAt: startedAt, deletedAt: null, schemaVersion: 1 as const, captureMethod: "manual" as const, provenance: "demo" as const });
  for (let day = 0; day < days; day += 1) {
    [1, 7, 13, 19].forEach((hour, index) => { const startedAt = instant(day, hour, 10 + index * 3); events.push(CareEventSchema.parse({ ...base(`demo-feed-${day.toString().padStart(2, "0")}-${index}`, startedAt), type: "feed", endedAt: instant(day, hour, 28 + index * 3), fields: index % 2 ? { mode: "bottle", volume: 90, unit: "ml", contents: "breastmilk" } : { mode: "nursing", side: index % 3 === 0 ? "left" : "right", durationMinutes: 18 } })); });
    [2, 9, 16].forEach((hour, index) => { const startedAt = instant(day, hour, 20 + index * 4); events.push(CareEventSchema.parse({ ...base(`demo-diaper-${day.toString().padStart(2, "0")}-${index}`, startedAt), type: "diaper", fields: { kind: index === 1 ? "both" : "wet" } })); });
    const sleeps = [{ start: [3, 5], end: [5, 0], kind: "unspecified" }, { start: [10, 15], end: [11, 20], kind: "nap" }, { start: [20, 30], end: [0, 30], kind: "night", crosses: true }] as const;
    sleeps.forEach((sleep, index) => { const startedAt = instant(day, sleep.start[0], sleep.start[1]); const endedAt = instant(day, sleep.end[0], sleep.end[1], "crosses" in sleep && sleep.crosses ? 1 : 0); events.push(CareEventSchema.parse({ ...base(`demo-sleep-${day.toString().padStart(2, "0")}-${index}`, startedAt), type: "sleep", endedAt, fields: { kind: sleep.kind } })); });
  }
  return events.sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
}