import { deflateSync, inflateSync } from "fflate";
import { z } from "zod";
import { HANDOFF_EXPIRY_HOURS, HANDOFF_PAYLOAD_MAX_BYTES } from "./constants";
import { UtcInstantSchema, type CareEvent } from "./types";
import { addHours, durationMinutes } from "./time";

const feedProjection = z.object({ type: z.literal("feed"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({ mode: z.enum(["nursing", "bottle"]), side: z.enum(["left", "right", "both"]).optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional() }).strict() }).strict();
const sleepProjection = z.object({ type: z.literal("sleep"), at: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), details: z.object({}).strict() }).strict();
const diaperProjection = z.object({ type: z.literal("diaper"), at: UtcInstantSchema, details: z.object({ kind: z.enum(["wet", "dirty", "both", "dry"]) }).strict() }).strict();
export const HandoffEventProjectionSchema = z.discriminatedUnion("type", [feedProjection, sleepProjection, diaperProjection]);
export const HandoffPayloadSchema = z.object({ v: z.literal(1), provenance: z.enum(["real", "demo"]), generatedAt: UtcInstantSchema, expiresAt: UtcInstantSchema, babyLabel: z.string().min(1).max(40), shiftStart: UtcInstantSchema, shiftEnd: UtcInstantSchema, events: z.array(HandoffEventProjectionSchema).max(30), openTimerIds: z.array(z.string()).max(5) }).strict();
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;

const MAGIC = new Uint8Array([0x4e, 0x43, 0x48, 0x31]);
function checksum(bytes: Uint8Array): number { let hash = 2166136261; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function hasMagic(bytes: Uint8Array): boolean { return bytes.length >= MAGIC.length && MAGIC.every((value, index) => bytes[index] === value); }

export function encodeHandoffPayload(payload: HandoffPayload): Uint8Array {
  const checked = HandoffPayloadSchema.parse(payload);
  const json = new TextEncoder().encode(JSON.stringify(checked));
  const compressed = deflateSync(json, { level: 9 });
  const encoded = new Uint8Array(MAGIC.length + 4 + compressed.length);
  encoded.set(MAGIC, 0); new DataView(encoded.buffer).setUint32(MAGIC.length, checksum(json)); encoded.set(compressed, MAGIC.length + 4);
  if (encoded.byteLength > HANDOFF_PAYLOAD_MAX_BYTES) throw new RangeError("Handoff payload exceeds QR ceiling");
  return encoded;
}

export function decodeHandoffPayload(bytes: Uint8Array): HandoffPayload {
  if (bytes.byteLength > HANDOFF_PAYLOAD_MAX_BYTES) throw new RangeError("Handoff payload exceeds QR ceiling");
  let json: Uint8Array;
  if (hasMagic(bytes)) {
    if (bytes.length < MAGIC.length + 5) throw new Error("Handoff payload is truncated");
    const expectedChecksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length);
    try { json = inflateSync(bytes.subarray(MAGIC.length + 4)); } catch { throw new Error("Handoff payload cannot be decompressed"); }
    if (checksum(json) !== expectedChecksum) throw new Error("Handoff payload checksum does not match");
  } else json = bytes;
  let value: unknown; try { value = JSON.parse(new TextDecoder().decode(json)); } catch { throw new Error("Handoff payload is not valid JSON"); }
  return HandoffPayloadSchema.parse(value);
}

export function encodeHandoffFragment(payload: HandoffPayload): string {
  const bytes = encodeHandoffPayload(payload); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `#handoff=${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}
export function decodeHandoffFragment(fragment: string): HandoffPayload {
  const encoded = fragment.replace(/^#/, "").replace(/^handoff=/, ""); const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let binary: string; try { binary = atob(padded); } catch { throw new Error("Handoff fragment is not valid base64url"); }
  return decodeHandoffPayload(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function project(event: CareEvent): z.infer<typeof HandoffEventProjectionSchema> | null {
  if (event.type === "feed") return HandoffEventProjectionSchema.parse({ type: "feed", at: event.startedAt, endedAt: event.endedAt, details: { mode: event.fields.mode, side: event.fields.side, volume: event.fields.volume, unit: event.fields.unit } });
  if (event.type === "sleep") return HandoffEventProjectionSchema.parse({ type: "sleep", at: event.startedAt, endedAt: event.endedAt, details: {} });
  if (event.type === "diaper") return HandoffEventProjectionSchema.parse({ type: "diaper", at: event.startedAt, details: { kind: event.fields.kind } });
  return null;
}

export function generateHandoffPayload(input: { events: CareEvent[]; provenance: "real" | "demo"; generatedAt: string; babyLabel: string; shiftStart: string; shiftEnd: string }): HandoffPayload {
  if (input.shiftStart > input.shiftEnd) throw new RangeError("Shift start must not be after shift end");
  const included = input.events.filter((event) => event.provenance === input.provenance && event.deletedAt === null && event.startedAt >= input.shiftStart && event.startedAt <= input.shiftEnd).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const events = included.map(project).filter((event): event is NonNullable<typeof event> => event !== null).slice(-30);
  const openTimerIds = included.filter((event) => (event.type === "feed" || event.type === "sleep") && event.endedAt === null).map((event) => event.id).slice(-5);
  return HandoffPayloadSchema.parse({ v: 1, provenance: input.provenance, generatedAt: input.generatedAt, expiresAt: addHours(input.generatedAt, HANDOFF_EXPIRY_HOURS), babyLabel: input.babyLabel, shiftStart: input.shiftStart, shiftEnd: input.shiftEnd, events, openTimerIds });
}

export function summarizeHandoffPayload(payload: HandoffPayload): { feeds: number; diapers: number; sleepMinutes: number; openTimers: number } {
  const checked = HandoffPayloadSchema.parse(payload); let sleepMinutes = 0;
  for (const event of checked.events) if (event.type === "sleep" && event.endedAt) sleepMinutes += Math.max(0, durationMinutes(event.at, event.endedAt));
  return { feeds: checked.events.filter((event) => event.type === "feed").length, diapers: checked.events.filter((event) => event.type === "diaper").length, sleepMinutes: Math.round(sleepMinutes), openTimers: checked.openTimerIds.length };
}