import { Temporal } from "@js-temporal/polyfill";
import { deflateSync, inflateSync } from "fflate";
import { z } from "zod";
import { HANDOFF_EXPIRY_HOURS, HANDOFF_PAYLOAD_MAX_BYTES, HANDOFF_URL_MAX_BYTES } from "./constants";
import { UtcInstantSchema, type CareEvent } from "./types";
import { addHours, durationMinutes, IanaTimeZoneSchema } from "./time";

const feedProjection = z.object({ type: z.literal("feed"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ mode: z.enum(["nursing", "bottle"]), side: z.enum(["left", "right", "both"]).optional(), durationMinutes: z.number().nonnegative().optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional(), contents: z.enum(["breastmilk", "formula", "mixed"]).optional() }).strict() }).strict();
const sleepProjection = z.object({ type: z.literal("sleep"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ kind: z.enum(["nap", "night", "unspecified"]) }).strict() }).strict();
const diaperProjection = z.object({ type: z.literal("diaper"), at: UtcInstantSchema, details: z.object({ kind: z.enum(["wet", "dirty", "both", "dry"]) }).strict() }).strict();
const pumpingProjection = z.object({ type: z.literal("pumping"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ durationMinutes: z.number().nonnegative().optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional() }).strict() }).strict();
const solidsProjection = z.object({ type: z.literal("solids"), at: UtcInstantSchema, details: z.object({ food: z.string().min(1).max(120) }).strict() }).strict();
const tummyTimeProjection = z.object({ type: z.literal("tummy-time"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ durationMinutes: z.number().positive() }).strict() }).strict();
const LegacyHandoffEventProjectionSchema = z.discriminatedUnion("type", [feedProjection, sleepProjection, diaperProjection]);
export const HandoffEventProjectionSchema = z.discriminatedUnion("type", [feedProjection, sleepProjection, diaperProjection, pumpingProjection, solidsProjection, tummyTimeProjection]);
export type HandoffEventProjection = z.infer<typeof HandoffEventProjectionSchema>;

export const HandoffTotalsSchema = z.object({
  feeds: z.number().int().nonnegative(), sleepSessions: z.number().int().nonnegative(), sleepMinutes: z.number().int().nonnegative(), diapers: z.number().int().nonnegative(),
  pumpingSessions: z.number().int().nonnegative(), pumpingMinutes: z.number().int().nonnegative(), solids: z.number().int().nonnegative(),
  tummyTimeSessions: z.number().int().nonnegative(), tummyTimeMinutes: z.number().int().nonnegative(),
}).strict();
export type HandoffTotals = z.infer<typeof HandoffTotalsSchema>;
const commonHandoffPayloadFields = {
  provenance: z.enum(["real", "demo"]), generatedAt: UtcInstantSchema, expiresAt: UtcInstantSchema, babyLabel: z.string().min(1).max(40),
  shiftStart: UtcInstantSchema, shiftEnd: UtcInstantSchema, openTimerCount: z.number().int().nonnegative(),
};
const legacyHandoffPayloadFields = { ...commonHandoffPayloadFields, events: z.array(LegacyHandoffEventProjectionSchema).max(30) };
const currentHandoffPayloadFields = { ...commonHandoffPayloadFields, events: z.array(HandoffEventProjectionSchema).max(30), totals: HandoffTotalsSchema };
const HandoffPayloadV1Schema = z.object({ v: z.literal(1), ...legacyHandoffPayloadFields }).strict();
const HandoffPayloadV2Schema = z.object({ v: z.literal(2), timeZone: IanaTimeZoneSchema, ...legacyHandoffPayloadFields }).strict();
const HandoffPayloadV3Schema = z.object({ v: z.literal(3), timeZone: IanaTimeZoneSchema, ...currentHandoffPayloadFields }).strict();
export const HandoffPayloadSchema = z.discriminatedUnion("v", [HandoffPayloadV1Schema, HandoffPayloadV2Schema, HandoffPayloadV3Schema]);
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;
export type CurrentHandoffPayload = z.infer<typeof HandoffPayloadV3Schema>;
export type HandoffTransport = "qr" | "url";

/** Byte ceilings include the complete UTF-8 fragment (`#handoff=` prefix plus base64url data), not just compressed payload bytes. */
export const HANDOFF_ARTIFACT_BOUNDS = Object.freeze({ qrFragmentBytes: HANDOFF_PAYLOAD_MAX_BYTES, urlFragmentBytes: HANDOFF_URL_MAX_BYTES, fragmentPrefix: "#handoff=" });
const MAGIC = new Uint8Array([0x4e, 0x43, 0x48, 0x31]);
function checksum(bytes: Uint8Array): number { let hash = 2166136261; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function hasMagic(bytes: Uint8Array): boolean { return bytes.length >= MAGIC.length && MAGIC.every((value, index) => bytes[index] === value); }
function artifactBytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

export function encodeHandoffPayload(payload: HandoffPayload): Uint8Array {
  const checked = HandoffPayloadSchema.parse(payload); const json = new TextEncoder().encode(JSON.stringify(checked)); const compressed = deflateSync(json, { level: 9 });
  const encoded = new Uint8Array(MAGIC.length + 4 + compressed.length); encoded.set(MAGIC, 0); new DataView(encoded.buffer).setUint32(MAGIC.length, checksum(json)); encoded.set(compressed, MAGIC.length + 4);
  if (encoded.byteLength > HANDOFF_URL_MAX_BYTES) throw new RangeError("Handoff codec envelope exceeds URL ceiling");
  return encoded;
}
export function decodeHandoffPayload(bytes: Uint8Array): HandoffPayload {
  if (bytes.byteLength > HANDOFF_URL_MAX_BYTES) throw new RangeError("Handoff codec envelope exceeds URL ceiling");
  if (!hasMagic(bytes)) throw new Error("Handoff payload is missing its codec frame");
  if (bytes.length < MAGIC.length + 5) throw new Error("Handoff payload is truncated");
  const expectedChecksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length); let json: Uint8Array;
  try { json = inflateSync(bytes.subarray(MAGIC.length + 4)); } catch { throw new Error("Handoff payload cannot be decompressed"); }
  if (checksum(json) !== expectedChecksum) throw new Error("Handoff payload checksum does not match");
  let value: unknown; try { value = JSON.parse(new TextDecoder().decode(json)); } catch { throw new Error("Handoff payload is not valid JSON"); }
  return HandoffPayloadSchema.parse(value);
}

export function encodeHandoffFragment(payload: CurrentHandoffPayload, transport: HandoffTransport = "qr"): string {
  if ((payload as HandoffPayload).v !== 3) throw new Error("A shareable handoff requires the complete v3 event and totals contract");
  const current = HandoffPayloadV3Schema.parse(payload);
  const bytes = encodeHandoffPayload(current); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  const fragment = `${HANDOFF_ARTIFACT_BOUNDS.fragmentPrefix}${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
  const ceiling = transport === "qr" ? HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes : HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes;
  if (artifactBytes(fragment) > ceiling) throw new RangeError(`Handoff ${transport} fragment exceeds ${ceiling}-byte ceiling`);
  return fragment;
}
export function decodeHandoffFragment(fragment: string): CurrentHandoffPayload {
  if (!fragment.startsWith(HANDOFF_ARTIFACT_BOUNDS.fragmentPrefix)) throw new Error("Handoff fragment is missing its frame");
  if (artifactBytes(fragment) > HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes) throw new RangeError("Handoff URL fragment exceeds URL ceiling");
  const encoded = fragment.slice(HANDOFF_ARTIFACT_BOUNDS.fragmentPrefix.length); const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let binary: string; try { binary = atob(padded); } catch { throw new Error("Handoff fragment is not valid base64url"); }
  const payload = decodeHandoffPayload(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  if (payload.v !== 3) throw new Error("This handoff predates complete event and full-shift totals protection and cannot be opened safely");
  return payload;
}
export function isHandoffExpired(payload: HandoffPayload, now: string): boolean { const checked = HandoffPayloadSchema.parse(payload); return Temporal.Instant.compare(Temporal.Instant.from(now), Temporal.Instant.from(checked.expiresAt)) >= 0; }

function project(event: CareEvent): HandoffEventProjection {
  if (event.type === "feed") return HandoffEventProjectionSchema.parse({ type: "feed", at: event.startedAt, endedAt: event.endedAt, details: { mode: event.fields.mode, side: event.fields.side, durationMinutes: event.fields.durationMinutes, volume: event.fields.volume, unit: event.fields.unit, contents: event.fields.contents } });
  if (event.type === "sleep") return HandoffEventProjectionSchema.parse({ type: "sleep", at: event.startedAt, endedAt: event.endedAt, details: { kind: event.fields.kind } });
  if (event.type === "diaper") return HandoffEventProjectionSchema.parse({ type: "diaper", at: event.startedAt, details: { kind: event.fields.kind } });
  if (event.type === "pumping") return HandoffEventProjectionSchema.parse({ type: "pumping", at: event.startedAt, endedAt: event.endedAt, details: { durationMinutes: event.fields.durationMinutes, volume: event.fields.volume, unit: event.fields.unit } });
  if (event.type === "solids") return HandoffEventProjectionSchema.parse({ type: "solids", at: event.startedAt, details: { food: event.fields.food } });
  if (event.type === "tummy-time") return HandoffEventProjectionSchema.parse({ type: "tummy-time", at: event.startedAt, endedAt: event.endedAt, details: { durationMinutes: event.fields.durationMinutes } });
  const exhaustive: never = event;
  return exhaustive;
}
function completedMinutes(event: CareEvent): number { return event.endedAt ? Math.max(0, durationMinutes(event.startedAt, event.endedAt)) : 0; }
function totalsFor(events: CareEvent[]): HandoffTotals {
  let feeds = 0, sleepSessions = 0, sleepMinutes = 0, diapers = 0, pumpingSessions = 0, pumpingMinutes = 0, solids = 0, tummyTimeSessions = 0, tummyTimeMinutes = 0;
  for (const event of events) {
    if (event.type === "feed") feeds += 1;
    else if (event.type === "sleep") { sleepSessions += 1; sleepMinutes += completedMinutes(event); }
    else if (event.type === "diaper") diapers += 1;
    else if (event.type === "pumping") { pumpingSessions += 1; pumpingMinutes += event.endedAt ? completedMinutes(event) : event.fields.durationMinutes ?? 0; }
    else if (event.type === "solids") solids += 1;
    else if (event.type === "tummy-time") { tummyTimeSessions += 1; tummyTimeMinutes += event.fields.durationMinutes; }
  }
  return HandoffTotalsSchema.parse({ feeds, sleepSessions, sleepMinutes: Math.round(sleepMinutes), diapers, pumpingSessions, pumpingMinutes: Math.round(pumpingMinutes), solids, tummyTimeSessions, tummyTimeMinutes: Math.round(tummyTimeMinutes) });
}
export function generateHandoffPayload(input: { events: CareEvent[]; provenance: "real" | "demo"; generatedAt: string; babyLabel: string; timeZone: string; shiftStart: string; shiftEnd: string }): CurrentHandoffPayload {
  if (input.shiftStart > input.shiftEnd) throw new RangeError("Shift start must not be after shift end");
  const included = input.events.filter((event) => event.provenance === input.provenance && event.deletedAt === null && event.startedAt >= input.shiftStart && event.startedAt <= input.shiftEnd).sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
  const totals = totalsFor(included);
  const events = included.map(project).slice(-30);
  const openTimerCount = included.filter((event) => (event.type === "feed" || event.type === "sleep") && event.endedAt === null).length;
  return HandoffPayloadV3Schema.parse({ v: 3, timeZone: input.timeZone, provenance: input.provenance, generatedAt: input.generatedAt, expiresAt: addHours(input.generatedAt, HANDOFF_EXPIRY_HOURS), babyLabel: input.babyLabel, shiftStart: input.shiftStart, shiftEnd: input.shiftEnd, totals, events, openTimerCount });
}
export function summarizeHandoffPayload(payload: HandoffPayload): { feeds: number; diapers: number; sleepMinutes: number; openTimers: number } {
  const checked = HandoffPayloadSchema.parse(payload);
  if (checked.v === 3) return { feeds: checked.totals.feeds, diapers: checked.totals.diapers, sleepMinutes: checked.totals.sleepMinutes, openTimers: checked.openTimerCount };
  let sleepMinutes = 0; for (const event of checked.events) if (event.type === "sleep" && event.endedAt) sleepMinutes += Math.max(0, durationMinutes(event.at, event.endedAt));
  return { feeds: checked.events.filter((event) => event.type === "feed").length, diapers: checked.events.filter((event) => event.type === "diaper").length, sleepMinutes: Math.round(sleepMinutes), openTimers: checked.openTimerCount };
}
