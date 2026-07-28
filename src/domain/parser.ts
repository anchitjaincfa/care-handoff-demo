import { ParseOutcomeSchema, type ParseOutcome, type ProposedEvent } from "./types";
import { addMinutes, durationMinutes, resolvePastTime, toUtcInstant } from "./time";

export type ParserContext = { now: string; timeZone: string; babyId?: string | null };
type Intent = "feed" | "sleep" | "diaper";
const EVENT_START = "(?:baby\\s+)?(?:fed|feed|nursed|breastfed|bottle-fed|slept|sleep|napped|nap|changed|had)";
const SLEEP_INTERVAL = /\bfrom\s+(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|(?:[01]\d|2[0-3]):[0-5]\d)\s+to\s+(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|(?:[01]\d|2[0-3]):[0-5]\d)\b/i;

function normalize(sourceText: string): string { return sourceText.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim(); }
function segment(sourceText: string): string[] {
  const eventLookahead = new RegExp(`(?=${EVENT_START}\\b)`, "i");
  return sourceText.replace(/[\n;]+/g, "|").replace(/\s+(?:and\s+then|then)\s+/gi, "|")
    .replace(/[,]+\s*/g, (value, offset, whole: string) => eventLookahead.test(whole.slice(offset + value.length)) ? "|" : value)
    .replace(new RegExp(`\\s+and\\s+${eventLookahead.source}`, "gi"), "|").split("|")
    .map((part) => part.replace(/^[,.\s]+|[,.\s]+$/g, "").trim()).filter(Boolean);
}
function stableClientId(sourceText: string, index: number): string { let hash = 2166136261; for (const character of sourceText) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return `parse-${index}-${(hash >>> 0).toString(36)}`; }
function refusal(clientId: string, sourceText: string, reason: "unsupported" | "ambiguous" | "unsafe" | "empty", explanation: string): ParseOutcome { return ParseOutcomeSchema.parse({ outcome: "refused", clientId, sourceText, refusalReason: reason, explanation }); }
function classifyIntent(text: string): Intent | null | "multiple" { const intents = new Set<Intent>(); if (/\b(feed|fed|nurs(?:e|ed|ing)|breastfed|bottle(?:-fed)?)\b/i.test(text)) intents.add("feed"); if (/\b(sleep|slept|nap|napped)\b/i.test(text)) intents.add("sleep"); if (/\b(diaper|nappy)\b/i.test(text) || /\bchanged\b.*\b(wet|dirty|dry)\b/i.test(text)) intents.add("diaper"); if (intents.size > 1) return "multiple"; return intents.values().next().value ?? null; }
function parseDuration(text: string): number | null { const match = text.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i); if (!match) return null; const amount = Number(match[1]); return match[2]?.toLowerCase().startsWith("h") ? amount * 60 : amount; }
function timeFailure(clientId: string, sourceText: string, result: Extract<ReturnType<typeof resolvePastTime>, { ok: false }>): ParseOutcome { return refusal(clientId, sourceText, result.reason === "future" ? "unsafe" : "ambiguous", result.explanation); }
function commonProposal(clientId: string, sourceText: string, intent: Intent, context: ParserContext, startedAt: string, fields: Record<string, unknown>, options: { endedAt?: string | null; assumptions?: string[]; unresolved?: string[]; confidence?: number } = {}): ProposedEvent {
  const unresolved = [...(options.unresolved ?? [])]; if (!context.babyId) unresolved.push("babyId");
  const confidence = Math.max(0.35, Math.min(0.99, (options.confidence ?? 0.93) - unresolved.length * 0.18));
  const fieldConfidence: Record<string, number> = { startedAt: options.assumptions?.length ? 0.72 : 0.95 };
  for (const key of Object.keys(fields)) fieldConfidence[`fields.${key}`] = 0.94; if (context.babyId) fieldConfidence.babyId = 1;
  return ParseOutcomeSchema.parse({ outcome: "proposed", clientId, sourceText, type: intent, babyId: context.babyId ?? null, startedAt, endedAt: options.endedAt, timeZone: context.timeZone, fields, confidence, fieldConfidence, assumptions: options.assumptions ?? [], unresolved }) as ProposedEvent;
}
function parseFeed(clientId: string, sourceText: string, context: ParserContext): ParseOutcome {
  const time = resolvePastTime(sourceText, context); if (!time.ok) return timeFailure(clientId, sourceText, time);
  const assumptions = time.assumption ? [time.assumption] : []; const fields: Record<string, unknown> = {}; const unresolved: string[] = [];
  const volume = sourceText.match(/\b(\d+(?:\.\d+)?)\s*(oz|ounces?|ml|millilit(?:er|re)s?)\b/i); const nursing = /\b(nurs(?:e|ed|ing)|breastfed)\b/i.test(sourceText); const bottle = /\bbottle(?:-fed)?\b/i.test(sourceText) || Boolean(volume);
  if (nursing) fields.mode = "nursing"; else if (bottle) fields.mode = "bottle"; else unresolved.push("fields.mode");
  const side = sourceText.match(/\b(left|right|both)(?:\s+side)?\b/i)?.[1]?.toLowerCase(); if (side && nursing) fields.side = side;
  if (volume) { fields.volume = Number(volume[1]); fields.unit = volume[2]?.toLowerCase().startsWith("m") ? "ml" : "oz"; }
  if (/\bformula\b/i.test(sourceText)) fields.contents = "formula"; else if (/\bmixed\b/i.test(sourceText)) fields.contents = "mixed"; else if (/\b(?:breast\s*milk|breastmilk)\b/i.test(sourceText)) fields.contents = "breastmilk";
  const duration = parseDuration(sourceText); let startedAt = time.instant; let endedAt: string | undefined;
  if (duration !== null) { fields.durationMinutes = duration; if (time.kind === "now") { endedAt = time.instant; startedAt = addMinutes(time.instant, -duration); assumptions.splice(0, assumptions.length, "The feed was treated as ending now."); } else { endedAt = addMinutes(startedAt, duration); if (durationMinutes(endedAt, context.now) < 0) return refusal(clientId, sourceText, "unsafe", "The stated duration would end in the future."); } }
  return commonProposal(clientId, sourceText, "feed", context, startedAt, fields, { endedAt, assumptions, unresolved });
}
function parseSleep(clientId: string, sourceText: string, context: ParserContext): ParseOutcome {
  const assumptions: string[] = []; const fields: Record<string, unknown> = { kind: /\bnap(?:ped)?\b/i.test(sourceText) ? "nap" : /\bnight\b/i.test(sourceText) ? "night" : "unspecified" }; const interval = sourceText.match(SLEEP_INTERVAL);
  if (interval) { const end = resolvePastTime(interval[2] ?? "", context); if (!end.ok) return timeFailure(clientId, sourceText, end); const start = resolvePastTime(interval[1] ?? "", { ...context, now: end.instant }); if (!start.ok) return timeFailure(clientId, sourceText, start); if (durationMinutes(start.instant, end.instant) <= 0) return refusal(clientId, sourceText, "ambiguous", "Sleep start must be before sleep end."); if (start.assumption) assumptions.push(start.assumption); if (end.assumption) assumptions.push(end.assumption); return commonProposal(clientId, sourceText, "sleep", context, start.instant, fields, { endedAt: end.instant, assumptions }); }
  const time = resolvePastTime(sourceText, context); if (!time.ok) return timeFailure(clientId, sourceText, time); if (time.assumption) assumptions.push(time.assumption); const duration = parseDuration(sourceText);
  if (duration !== null) { const endedAt = time.kind === "now" ? time.instant : addMinutes(time.instant, duration); const startedAt = time.kind === "now" ? addMinutes(time.instant, -duration) : time.instant; if (durationMinutes(endedAt, context.now) < 0) return refusal(clientId, sourceText, "unsafe", "The stated duration would end in the future."); if (time.kind === "now") assumptions.splice(0, assumptions.length, "The sleep was treated as ending now."); return commonProposal(clientId, sourceText, "sleep", context, startedAt, fields, { endedAt, assumptions }); }
  return commonProposal(clientId, sourceText, "sleep", context, time.instant, fields, { endedAt: null, assumptions });
}
function parseDiaper(clientId: string, sourceText: string, context: ParserContext): ParseOutcome {
  const time = resolvePastTime(sourceText, context); if (!time.ok) return timeFailure(clientId, sourceText, time); const wet = /\bwet\b/i.test(sourceText); const dirty = /\b(dirty|soiled|poop(?:y|ed)?)\b/i.test(sourceText); const dry = /\bdry\b/i.test(sourceText);
  if (!wet && !dirty && !dry) return commonProposal(clientId, sourceText, "diaper", context, time.instant, {}, { assumptions: time.assumption ? [time.assumption] : [], unresolved: ["fields.kind"], confidence: 0.72 });
  const kind = wet && dirty ? "both" : wet ? "wet" : dirty ? "dirty" : "dry"; return commonProposal(clientId, sourceText, "diaper", context, time.instant, { kind }, { assumptions: time.assumption ? [time.assumption] : [] });
}
export function parseCareEvents(sourceText: string, context: ParserContext): ParseOutcome[] {
  const normalized = normalize(sourceText); if (!normalized) return [refusal("parse-0-empty", sourceText, "empty", "Nothing was entered.")];
  return segment(normalized).map((part, index) => { const clientId = stableClientId(part, index); const intent = classifyIntent(part); if (intent === "multiple") return refusal(clientId, part, "ambiguous", "This part contains more than one care event."); if (!intent) return refusal(clientId, part, "unsupported", "Only feed, sleep, and diaper entries are supported here."); if (intent === "feed") return parseFeed(clientId, part, context); if (intent === "sleep") return parseSleep(clientId, part, context); return parseDiaper(clientId, part, context); });
}
export function parseSingleCareEvent(sourceText: string, context: ParserContext): ParseOutcome { const outcomes = parseCareEvents(sourceText, context); if (outcomes.length !== 1) return refusal(stableClientId(sourceText, 0), sourceText, "ambiguous", "This entry contains multiple care events."); return outcomes[0] ?? refusal("parse-0-empty", sourceText, "empty", "Nothing was entered."); }
export function parserReferenceNow(context: ParserContext): string { return toUtcInstant(context.now); }