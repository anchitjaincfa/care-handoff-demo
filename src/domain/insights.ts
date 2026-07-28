import { Temporal } from "@js-temporal/polyfill";
import { FRESHNESS_MAX_DAYS, PREDICTION_MIN_SAMPLES } from "./constants";
import type { CareEvent } from "./types";
import { addMinutes, durationMinutes, toUtcInstant } from "./time";

type InsightType = "feed" | "sleep" | "diaper";
type Forming = { status: "forming"; reason: "insufficient-samples" | "stale"; sampleCount: number; requiredSamples: number; freshnessDays?: number; description: string };
export type RoutineWindow = Forming | { status: "ready"; sampleCount: number; requiredSamples: number; lowerQuartileMinuteOfDay: number; medianMinuteOfDay: number; upperQuartileMinuteOfDay: number; freshnessDays: number; description: string };
export type NextEventWindow = Forming | { status: "ready"; sampleCount: number; requiredSamples: number; freshnessDays: number; windowStart: string; midpoint: string; windowEnd: string; medianIntervalMinutes: number; description: string };

function quantile(sorted: number[], fraction: number): number { if (!sorted.length) throw new RangeError("Cannot calculate a quantile without samples"); const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position); const low = sorted[lower] ?? 0; const high = sorted[upper] ?? low; return low + (high - low) * (position - lower); }
function samples(events: CareEvent[], type: InsightType, now: string): CareEvent[] { return events.filter((event) => event.type === type && event.deletedAt === null && event.startedAt <= now && (event.type === "diaper" || Boolean(event.endedAt))).sort((left, right) => left.startedAt.localeCompare(right.startedAt)); }
function forming(sampleCount: number, reason: Forming["reason"], freshnessDays?: number): Forming { return { status: "forming", reason, sampleCount, requiredSamples: PREDICTION_MIN_SAMPLES, freshnessDays, description: reason === "stale" ? "Recent records are needed before a current pattern can be shown." : "Patterns are still forming." }; }
function freshnessDays(observed: CareEvent[], now: string): number { const last = observed.at(-1); return last ? Math.max(0, durationMinutes(last.startedAt, now) / 1_440) : Number.POSITIVE_INFINITY; }
function circularWindow(minutes: number[]): [number, number, number] {
  const sorted = [...minutes].sort((left, right) => left - right); let largestGap = -1; let startIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) { const current = sorted[index] ?? 0; const next = index === sorted.length - 1 ? (sorted[0] ?? 0) + 1_440 : (sorted[index + 1] ?? 0); if (next - current > largestGap) { largestGap = next - current; startIndex = (index + 1) % sorted.length; } }
  const unwrapped = Array.from({ length: sorted.length }, (_, offset) => { const index = (startIndex + offset) % sorted.length; const value = sorted[index] ?? 0; return index < startIndex ? value + 1_440 : value; }).sort((a, b) => a - b);
  return [Math.round(quantile(unwrapped, 0.25) % 1_440), Math.round(quantile(unwrapped, 0.5) % 1_440), Math.round(quantile(unwrapped, 0.75) % 1_440)];
}

export function buildRoutineWindow(events: CareEvent[], type: InsightType, now: string, timeZone: string): RoutineWindow {
  const observed = samples(events, type, now); if (observed.length < PREDICTION_MIN_SAMPLES) return forming(observed.length, "insufficient-samples");
  const freshness = freshnessDays(observed, now); if (freshness > FRESHNESS_MAX_DAYS) return forming(observed.length, "stale", Math.round(freshness * 10) / 10);
  const minuteOfDay = observed.map((event) => { const local = Temporal.Instant.from(event.startedAt).toZonedDateTimeISO(timeZone); return local.hour * 60 + local.minute; });
  const [lowerQuartileMinuteOfDay, medianMinuteOfDay, upperQuartileMinuteOfDay] = circularWindow(minuteOfDay);
  return { status: "ready", sampleCount: observed.length, requiredSamples: PREDICTION_MIN_SAMPLES, lowerQuartileMinuteOfDay, medianMinuteOfDay, upperQuartileMinuteOfDay, freshnessDays: Math.round(freshness * 10) / 10, description: `Observed ${type} timing range from ${observed.length} complete records.` };
}

export function predictNextEventWindow(events: CareEvent[], type: InsightType, now: string): NextEventWindow {
  const observed = samples(events, type, now); if (observed.length < PREDICTION_MIN_SAMPLES) return forming(observed.length, "insufficient-samples");
  const freshness = freshnessDays(observed, now); if (freshness > FRESHNESS_MAX_DAYS) return forming(observed.length, "stale", Math.round(freshness * 10) / 10);
  const intervals = observed.slice(1).map((event, index) => durationMinutes(observed[index]?.startedAt ?? event.startedAt, event.startedAt)).filter((minutes) => minutes > 0).sort((a, b) => a - b); if (!intervals.length) return forming(observed.length, "insufficient-samples");
  const lower = quantile(intervals, 0.25); const median = quantile(intervals, 0.5); const upper = quantile(intervals, 0.75); const last = observed.at(-1); if (!last) return forming(observed.length, "insufficient-samples");
  const elapsed = Math.max(0, durationMinutes(last.startedAt, now)); const cycles = Math.max(1, Math.ceil(elapsed / median)); const projectedStart = addMinutes(last.startedAt, lower * cycles); const windowStart = Temporal.Instant.compare(Temporal.Instant.from(projectedStart), Temporal.Instant.from(now)) < 0 ? toUtcInstant(now) : projectedStart;
  return { status: "ready", sampleCount: observed.length, requiredSamples: PREDICTION_MIN_SAMPLES, freshnessDays: Math.round(freshness * 10) / 10, windowStart, midpoint: addMinutes(last.startedAt, median * cycles), windowEnd: addMinutes(last.startedAt, upper * cycles), medianIntervalMinutes: Math.round(median), description: `A descriptive range from ${observed.length} complete ${type} records.` };
}