import { Temporal } from "@js-temporal/polyfill";

export type TimeResolution =
  | { ok: true; instant: string; kind: "now" | "relative" | "clock" | "absolute"; assumption?: string }
  | { ok: false; reason: "ambiguous" | "future" | "invalid"; explanation: string };

export type ResolveTimeOptions = { now: string; timeZone: string };

const CLOCK_WITH_MERIDIEM = /\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
const CLOCK_24_HOUR = /\b(?:at\s+)([0-2]?\d):([0-5]\d)\b/i;
const RELATIVE_PAST = /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\s+ago\b/i;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

export function toUtcInstant(value: string | Temporal.Instant): string {
  return Temporal.Instant.from(value).toString({ smallestUnit: "millisecond" });
}

export function assertTimeZone(timeZone: string): string {
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  return timeZone;
}

export function wallClockForInstant(instant: string, timeZone: string): string {
  assertTimeZone(timeZone);
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "second" });
}

export function durationMinutes(startedAt: string, endedAt: string): number {
  const start = Temporal.Instant.from(startedAt);
  const end = Temporal.Instant.from(endedAt);
  return Number(end.epochMilliseconds - start.epochMilliseconds) / 60_000;
}

export function addMinutes(instant: string, minutes: number): string {
  if (!Number.isFinite(minutes)) throw new RangeError("Minutes must be finite");
  return toUtcInstant(Temporal.Instant.from(instant).add({ milliseconds: Math.round(minutes * 60_000) }));
}

export function addHours(instant: string, hours: number): string {
  return addMinutes(instant, hours * 60);
}

export function zonedDateTimeToInstant(
  date: string,
  time: { hour: number; minute?: number; second?: number },
  timeZone: string,
  disambiguation: "compatible" | "earlier" | "later" | "reject" = "compatible",
): string {
  const plainDate = Temporal.PlainDate.from(date);
  return toUtcInstant(Temporal.ZonedDateTime.from({
    timeZone: assertTimeZone(timeZone), year: plainDate.year, month: plainDate.month, day: plainDate.day,
    hour: time.hour, minute: time.minute ?? 0, second: time.second ?? 0, millisecond: 0,
  }, { disambiguation }).toInstant());
}

function clockParts(expression: string): { hour: number; minute: number } | Extract<TimeResolution, { ok: false }> | null {
  const meridiem = expression.match(CLOCK_WITH_MERIDIEM);
  if (meridiem) {
    const rawHour = Number(meridiem[1]);
    if (rawHour < 1 || rawHour > 12) return { ok: false, reason: "invalid", explanation: "Clock hour is invalid." };
    const isPm = meridiem[3]?.toLowerCase().startsWith("p") ?? false;
    return { hour: (rawHour % 12) + (isPm ? 12 : 0), minute: Number(meridiem[2] ?? 0) };
  }
  const twentyFourHour = expression.match(CLOCK_24_HOUR);
  if (!twentyFourHour) return null;
  const hourText = twentyFourHour[1] ?? "";
  const hour = Number(hourText);
  if (hour > 23) return { ok: false, reason: "invalid", explanation: "Clock hour is invalid." };
  if (hour > 0 && hour <= 12 && hourText.length < 2) return { ok: false, reason: "ambiguous", explanation: "Add am or pm to make the time unambiguous." };
  return { hour, minute: Number(twentyFourHour[2] ?? 0) };
}

function isFailure(value: { hour: number; minute: number } | Extract<TimeResolution, { ok: false }>): value is Extract<TimeResolution, { ok: false }> {
  return "ok" in value && value.ok === false;
}

export function resolvePastTime(expression: string, options: ResolveTimeOptions): TimeResolution {
  let now: Temporal.Instant;
  try { now = Temporal.Instant.from(options.now); assertTimeZone(options.timeZone); }
  catch { return { ok: false, reason: "invalid", explanation: "The reference time or time zone is invalid." }; }

  const normalized = expression.trim().toLowerCase();
  if (/\b(tomorrow|later|next\s+(?:hour|day|week)|in\s+\d+\s*(?:minutes?|hours?))\b/.test(normalized)) {
    return { ok: false, reason: "future", explanation: "Future times are not logged as completed care events." };
  }
  const relative = normalized.match(RELATIVE_PAST);
  if (relative) {
    const amount = Number(relative[1]);
    const minutes = relative[2]?.toLowerCase().startsWith("h") ? amount * 60 : amount;
    if (!Number.isFinite(minutes) || minutes < 0) return { ok: false, reason: "invalid", explanation: "The relative time is invalid." };
    return { ok: true, instant: addMinutes(toUtcInstant(now), -minutes), kind: "relative" };
  }
  if (/\bnow\b/.test(normalized)) return { ok: true, instant: toUtcInstant(now), kind: "now" };

  const parsedClock = clockParts(normalized);
  if (parsedClock && isFailure(parsedClock)) return parsedClock;
  if (parsedClock) {
    const currentLocal = now.toZonedDateTimeISO(options.timeZone);
    const explicitDateMatch = normalized.match(ISO_DATE);
    let date: Temporal.PlainDate;
    try {
      date = explicitDateMatch ? Temporal.PlainDate.from(explicitDateMatch[1] ?? "") : currentLocal.toPlainDate().subtract({ days: /\byesterday\b/.test(normalized) ? 1 : 0 });
    } catch { return { ok: false, reason: "invalid", explanation: "The calendar date is invalid." }; }
    let candidate: Temporal.Instant;
    try { candidate = Temporal.Instant.from(zonedDateTimeToInstant(date.toString(), parsedClock, options.timeZone)); }
    catch { return { ok: false, reason: "invalid", explanation: "The local time cannot be resolved in this time zone." }; }
    const dateWasExplicit = Boolean(explicitDateMatch) || /\b(today|yesterday)\b/.test(normalized);
    if (Temporal.Instant.compare(candidate, now) > 0) {
      if (dateWasExplicit) return { ok: false, reason: "future", explanation: "That time is in the future; completed events must be in the past." };
      date = date.subtract({ days: 1 });
      candidate = Temporal.Instant.from(zonedDateTimeToInstant(date.toString(), parsedClock, options.timeZone));
    }
    return { ok: true, instant: toUtcInstant(candidate), kind: explicitDateMatch ? "absolute" : "clock", assumption: dateWasExplicit ? undefined : "The nearest past occurrence of the clock time was used." };
  }
  if (ISO_DATE.test(normalized)) return { ok: false, reason: "ambiguous", explanation: "Add a clock time to the calendar date." };
  if (/\bat\s+\d{1,2}\b/.test(normalized)) return { ok: false, reason: "ambiguous", explanation: "Add am or pm to make the time unambiguous." };
  return { ok: true, instant: toUtcInstant(now), kind: "now", assumption: "Time was not provided; now was assumed." };
}