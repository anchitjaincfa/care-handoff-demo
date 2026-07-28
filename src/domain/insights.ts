import { Temporal } from "@js-temporal/polyfill";
import { PREDICTION_MIN_SAMPLES } from "./constants";
import type { CareEvent } from "./types";
import { addMinutes, durationMinutes, toUtcInstant } from "./time";

type InsightType = "feed" | "sleep" | "diaper";
type Forming = { status: "forming"; sampleCount: number; requiredSamples: number; description: string };
export type RoutineWindow = Forming | { status: "ready"; sampleCount: number; requiredSamples: number; earliestMinuteOfDay: number; medianMinuteOfDay: number; latestMinuteOfDay: number; freshnessDays: number; description: string };
export type NextEventWindow = Forming | { status: "ready"; sampleCount: number; requiredSamples: number; windowStart: string; midpoint: string; windowEnd: string; medianIntervalMinutes: number; description: string };

function quantile(sorted: number[], fraction: number): number {
  if (!sorted.length) throw new RangeError("Cannot calculate a quantile without samples");
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position); const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0; const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

function samples(events: CareEvent[], type: InsightType): CareEvent[] {
  return events.filter((event) => event.type === type && event.deletedAt === null && (event.type === "diaper" || Boolean(event.endedAt)))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function forming(sampleCount: number): Forming {
  return { status: "forming", sampleCount, requiredSamples: PREDICTION_MIN_SAMPLES, description: "Patterns are still forming." };
}

function circularWindow(minutes: number[]): [number, number, number] {
  const sorted = [...minutes].sort((left, right) => left - right);
  let largestGap = -1; let startIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index] ?? 0; const next = index === sorted.length - 1 ? (sorted[0] ?? 0) + 1_440 : (sorted[index + 1] ?? 0);
    if (next - current > largestGap) { largestGap = next - current; startIndex = (index + 1) % sorted.length; }
  }
  const unwrapped = Array.from({ length: sorted.length }, (_, offset) => { const index = (startIndex + offset) % sorted.length; const value = sorted[index] ?? 0; return index < startIndex ? value + 1_440 : value; }).sort((a, b) => a - b);
  return [quantile(unwrapped, 0.25) % 1_440, quantile(unwrapped, 0.5) % 1_440, quantile(unwrapped, 0.75) % 1_440].map(Math.round) as [number, number, number];
}

export function buildRoutineWindow(events: CareEvent[], type: InsightType, now: string, timeZone: string): RoutineWindow {
  const observed = samples(events, type);
  if (observed.length < PREDICTION_MIN_SAMPLES) return forming(observed.length);
  const minuteOfDay = observed.map((event) => { const local = Temporal.Instant.from(event.startedAt).toZonedDateTimeISO(timeZone); return local.hour * 60 + local.minute; });
  const [earliestMinuteOfDay, medianMinuteOfDay, latestMinuteOfDay] = circularWindow(minuteOfDay);
  const last = observed.at(-1);
  const freshnessDays = last ? Math.max(0, durationMinutes(last.startedAt, now) / 1_440) : 0;
  return { status: "ready", sampleCount: observed.length, requiredSamples: PREDICTION_MIN_SAMPLES, earliestMinuteOfDay, medianMinuteOfDay, latestMinuteOfDay, freshnessDays: Math.round(freshnessDays * 10) / 10, description: `Observed ${type} timing range from ${observed.length} complete records.` };
}

export function predictNextEventWindow(events: CareEvent[], type: InsightType, now: string): NextEventWindow {
  const observed = samples(events, type);
  if (observed.length < PREDICTION_MIN_SAMPLES) return forming(observed.length);
  const intervals = observed.slice(1).map((event, index) => durationMinutes(observed[index]?.startedAt ?? event.startedAt, event.startedAt)).filter((minutes) => minutes > 0).sort((a, b) => a - b);
  if (!intervals.length) return forming(observed.length);
  const lower = quantile(intervals, 0.25); const median = quantile(intervals, 0.5); const upper = quantile(intervals, 0.75);
  const last = observed.at(-1);
  if (!last) return forming(observed.length);
  const elapsed = Math.max(0, durationMinutes(last.startedAt, now));
  const cycles = Math.max(1, Math.ceil(elapsed / median));
  const windowStart = Temporal.Instant.compare(Temporal.Instant.from(addMinutes(last.startedAt, lower * cycles)), Temporal.Instant.from(now)) < 0 ? toUtcInstant(now) : addMinutes(last.startedAt, lower * cycles);
  return { status: "ready", sampleCount: observed.length, requiredSamples: PREDICTION_MIN_SAMPLES, windowStart, midpoint: addMinutes(last.startedAt, median * cycles), windowEnd: addMinutes(last.startedAt, upper * cycles), medianIntervalMinutes: Math.round(median), description: `A descriptive range from ${observed.length} complete ${type} records.` };
}