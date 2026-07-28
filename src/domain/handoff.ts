import { Temporal } from "@js-temporal/polyfill";
import { deflateSync, inflateSync } from "fflate";
import { z } from "zod";
import { HANDOFF_EXPIRY_HOURS, HANDOFF_PAYLOAD_MAX_BYTES, HANDOFF_URL_MAX_BYTES } from "./constants";
import { UtcInstantSchema, type CareEvent } from "./types";
import { addHours, assertTimeZone, durationMinutes } from "./time";

const feedProjection = z.object({ type: z.literal("feed"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ mode: z.enum(["nursing", "bottle"]), side: z.enum(["left", "right", "both"]).optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional() }).strict() }).strict();
const sleepProjection = z.object({ type: z.literal("sleep"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({}).strict() }).strict();
const diaperProjection = z.object({ type: z.literal("diaper"), at: UtcInstantSchema, details: z.object({ kind: z.enum(["wet", "dirty", "both", "dry"]) }).strict() }).strict();
export const HandoffEventProjectionSchema = z.discriminatedUnion("type", [feedProjection, sleepProjection, diaperProjection]);
const handoffPayloadFields = {
  provenance: z.enum(["real", "demo"]),
  generatedAt: UtcInstantSchema,
  expiresAt: UtcInstantSchema,
  babyLabel: z.string().min(1).max(40),
  shiftStart: UtcInstantSchema,
  shiftEnd: UtcInstantSchema,
  events: z.array(HandoffEventProjectionSchema).max(30),
  openTimerCount: z.number().int().nonnegative(),
};
const sourceTimeZone = z.string().min(1).refine((value) => {
  try { assertTimeZone(value); return true; } catch { return false; }
}, "Handoff source time zone must be valid");
const HandoffPayloadV1Schema = z.object({ v: z.literal(1), ...handoffPayloadFields }).strict();
const HandoffPayloadV2Schema = z.object({ v: z.literal(2), timeZone: sourceTimeZone, ...handoffPayloadFields }).strict();
export const HandoffPayloadSchema = z.discriminatedUnion("v", [HandoffPayloadV1Schema, HandoffPayloadV2Schema]);
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;
export type CurrentHandoffPayload = Extract<HandoffPayload, { v: 2 }>;
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
  const current = HandoffPayloadV2Schema.parse(payload);
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
  if (payload.v !== 2) throw new Error("This handoff predates source-time-zone protection and cannot be opened safely");
  return payload;
}
export function isHandoffExpired(payload: HandoffPayload, now: string): boolean { const checked = HandoffPayloadSchema.parse(payload); return Temporal.Instant.compare(Temporal.Instant.from(now), Temporal.Instant.from(checked.expiresAt)) >= 0; }

function project(event: CareEvent): z.infer<typeof HandoffEventProjectionSchema> | null {
  if (event.type === "feed") return HandoffEventProjectionSchema.parse({ type: "feed", at: event.startedAt, endedAt: event.endedAt, details: { mode: event.fields.mode, side: event.fields.side, volume: event.fields.volume, unit: event.fields.unit } });
  if (event.type === "sleep") return HandoffEventProjectionSchema.parse({ type: "sleep", at: event.startedAt, endedAt: event.endedAt, details: {} });
  if (event.type === "diaper") return HandoffEventProjectionSchema.parse({ type: "diaper", at: event.startedAt, details: { kind: event.fields.kind } });
  return null;
}
export function generateHandoffPayload(input: { events: CareEvent[]; provenance: "real" | "demo"; generatedAt: string; babyLabel: string; timeZone: string; shiftStart: string; shiftEnd: string }): CurrentHandoffPayload {
  if (input.shiftStart > input.shiftEnd) throw new RangeError("Shift start must not be after shift end");
  const included = input.events.filter((event) => event.provenance === input.provenance && event.deletedAt === null && event.startedAt >= input.shiftStart && event.startedAt <= input.shiftEnd).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const events = included.map(project).filter((event): event is NonNullable<typeof event> => event !== null).slice(-30);
  const openTimerCount = included.filter((event) => (event.type === "feed" || event.type === "sleep") && event.endedAt === null).length;
  return HandoffPayloadV2Schema.parse({ v: 2, timeZone: input.timeZone, provenance: input.provenance, generatedAt: input.generatedAt, expiresAt: addHours(input.generatedAt, HANDOFF_EXPIRY_HOURS), babyLabel: input.babyLabel, shiftStart: input.shiftStart, shiftEnd: input.shiftEnd, events, openTimerCount });
}
export function summarizeHandoffPayload(payload: HandoffPayload): { feeds: number; diapers: number; sleepMinutes: number; openTimers: number } {
  const checked = HandoffPayloadSchema.parse(payload); let sleepMinutes = 0; for (const event of checked.events) if (event.type === "sleep" && event.endedAt) sleepMinutes += Math.max(0, durationMinutes(event.at, event.endedAt));
  return { feeds: checked.events.filter((event) => event.type === "feed").length, diapers: checked.events.filter((event) => event.type === "diaper").length, sleepMinutes: Math.round(sleepMinutes), openTimers: checked.openTimerCount };
}