import type { CareEvent, EventType } from "@/src/domain/types";
import { buildRoutineWindow, predictNextEventWindow } from "@/src/domain/insights";
import { durationMinutes } from "@/src/domain/time";
import type {
  EventEditDraft,
  EventRowViewModel,
  InsightsPageProps,
  NextEventWindowViewModel,
  RoutineWindowViewModel,
  TimelineGroupViewModel,
} from "@/src/features/runtime/contracts";

export type ViewLocale = { locale: string; timeZone: string };

function formatter(locale: ViewLocale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try { return new Intl.DateTimeFormat(locale.locale, { ...options, timeZone: locale.timeZone }); }
  catch { return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }); }
}

export function formatTime(instant: string, locale: ViewLocale): string {
  return formatter(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(instant));
}

export function formatDate(instant: string, locale: ViewLocale): string {
  return formatter(locale, { weekday: "long", month: "long", day: "numeric" }).format(new Date(instant));
}

function durationLabel(event: CareEvent): string | null {
  if (!event.endedAt) return null;
  const minutes = Math.max(0, Math.round(durationMinutes(event.startedAt, event.endedAt)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function titleFor(event: CareEvent): string {
  if (event.type === "feed") return event.fields.mode === "bottle" ? "Bottle feed" : "Nursing";
  if (event.type === "sleep") return event.endedAt ? "Sleep" : "Sleep timer";
  if (event.type === "diaper") return "Diaper";
  if (event.type === "pumping") return "Pumping";
  if (event.type === "solids") return "Solids";
  return "Tummy time";
}

function detailFor(event: CareEvent): string {
  if (event.deletedAt) return "Deleted — undo is available until another change";
  if (event.type === "feed") {
    const amount = event.fields.volume && event.fields.unit ? `${event.fields.volume} ${event.fields.unit}` : null;
    return [amount, event.fields.side, durationLabel(event), event.endedAt === null ? "Timer running" : null].filter(Boolean).join(" · ") || "Logged feed";
  }
  if (event.type === "sleep") return event.endedAt === null ? "Timer running" : durationLabel(event) ?? "Logged sleep";
  if (event.type === "diaper") return `${event.fields.kind[0]?.toUpperCase()}${event.fields.kind.slice(1)}`;
  if (event.type === "pumping") return durationLabel(event) ?? (event.fields.volume && event.fields.unit ? `${event.fields.volume} ${event.fields.unit}` : "Logged pumping");
  if (event.type === "solids") return event.fields.food;
  return `${event.fields.durationMinutes} min`;
}

export function toEventRow(event: CareEvent, locale: ViewLocale): EventRowViewModel {
  return {
    id: event.id,
    type: event.type,
    timeLabel: formatTime(event.startedAt, locale),
    title: titleFor(event),
    detail: detailFor(event),
    canEdit: !event.deletedAt,
    canDelete: !event.deletedAt,
  };
}

export function toEditDraft(event: CareEvent): EventEditDraft {
  const fields: Record<string, string | number | null> = {
    startedAt: event.startedAt,
    endedAt: event.endedAt ?? null,
  };
  for (const [key, value] of Object.entries(event.fields)) {
    if (typeof value === "string" || typeof value === "number" || value === null) fields[`fields.${key}`] = value;
  }
  return { id: event.id, fields };
}

export function timelineGroups(events: CareEvent[], locale: ViewLocale, filter: "all" | EventType): TimelineGroupViewModel[] {
  const groups = new Map<string, CareEvent[]>();
  for (const event of events.filter((candidate) => !candidate.deletedAt && (filter === "all" || candidate.type === filter)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const heading = formatDate(event.startedAt, locale);
    const current = groups.get(heading) ?? [];
    current.push(event);
    groups.set(heading, current);
  }
  return [...groups.entries()].map(([heading, rows]) => ({ id: heading, heading, events: rows.map((event) => toEventRow(event, locale)) }));
}

function minuteLabel(minuteOfDay: number): string {
  const normalized = ((minuteOfDay % 1_440) + 1_440) % 1_440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function routineView(events: CareEvent[], now: string, locale: ViewLocale): RoutineWindowViewModel {
  const value = buildRoutineWindow(events, "feed", now, locale.timeZone);
  const evidence = { sampleCount: value.sampleCount, requiredSamples: value.requiredSamples, stale: value.status === "forming" && value.reason === "stale", ...(value.freshnessDays === undefined ? {} : { freshnessLabel: `${value.freshnessDays} days since latest complete record` }) };
  if (value.status === "forming") return { status: "forming", description: value.description, evidence };
  return { status: "ready", description: value.description, evidence, lowerLabel: minuteLabel(value.lowerQuartileMinuteOfDay), medianLabel: minuteLabel(value.medianMinuteOfDay), upperLabel: minuteLabel(value.upperQuartileMinuteOfDay) };
}

function nextView(events: CareEvent[], now: string, locale: ViewLocale): NextEventWindowViewModel {
  const value = predictNextEventWindow(events, "feed", now);
  const evidence = { sampleCount: value.sampleCount, requiredSamples: value.requiredSamples, stale: value.status === "forming" && value.reason === "stale", ...(value.freshnessDays === undefined ? {} : { freshnessLabel: `${value.freshnessDays} days since latest complete record` }) };
  if (value.status === "forming") return { status: "forming", description: value.description, evidence };
  return {
    status: "ready",
    description: value.description,
    evidence,
    windowStartLabel: formatTime(value.windowStart, locale),
    midpointLabel: formatTime(value.midpoint, locale),
    windowEndLabel: formatTime(value.windowEnd, locale),
    medianIntervalLabel: `${value.medianIntervalMinutes} min`,
  };
}

export function buildInsightsView(events: CareEvent[], now: string, mode: "real" | "demo", locale: ViewLocale): InsightsPageProps {
  const active = events.filter((event) => !event.deletedAt && event.startedAt <= now);
  const sevenDaysAgo = new Date(Date.parse(now) - 7 * 86_400_000).toISOString();
  const recent = active.filter((event) => event.startedAt >= sevenDaysAgo);
  const sleepMinutes = recent.reduce((total, event) => total + (event.type === "sleep" && event.endedAt ? Math.max(0, durationMinutes(event.startedAt, event.endedAt)) : 0), 0);
  return {
    mode,
    summary: {
      feeds: recent.filter((event) => event.type === "feed").length,
      sleepMinutes: Math.round(sleepMinutes),
      diapers: recent.filter((event) => event.type === "diaper").length,
      rangeLabel: "Past 7 days",
    },
    routine: routineView(active, now, locale),
    nextEvent: nextView(active, now, locale),
    generatedLabel: `Generated ${formatTime(now, locale)}`,
  };
}