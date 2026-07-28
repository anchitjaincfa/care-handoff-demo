import { z } from "zod";
import { HANDOFF_PAYLOAD_MAX_BYTES } from "./constants";
import { UtcInstantSchema } from "./types";

const feedProjection = z.object({ type:z.literal("feed"), at:UtcInstantSchema, endedAt:UtcInstantSchema.nullable().optional(), details:z.object({ mode:z.enum(["nursing","bottle"]), side:z.enum(["left","right","both"]).optional(), volume:z.number().positive().optional(), unit:z.enum(["oz","ml"]).optional() }) });
const sleepProjection = z.object({ type:z.literal("sleep"), at:UtcInstantSchema, endedAt:UtcInstantSchema.nullable().optional(), details:z.object({}) });
const diaperProjection = z.object({ type:z.literal("diaper"), at:UtcInstantSchema, details:z.object({ kind:z.enum(["wet","dirty","both","dry"]) }) });
export const HandoffEventProjectionSchema = z.discriminatedUnion("type", [feedProjection,sleepProjection,diaperProjection]);
export const HandoffPayloadSchema = z.object({ v:z.literal(1), provenance:z.enum(["real","demo"]), generatedAt:UtcInstantSchema, expiresAt:UtcInstantSchema, babyLabel:z.string().min(1).max(40), shiftStart:UtcInstantSchema, shiftEnd:UtcInstantSchema, events:z.array(HandoffEventProjectionSchema).max(30), openTimerIds:z.array(z.string()).max(5) });
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;
export function encodeHandoffPayload(payload:HandoffPayload):Uint8Array { const checked=HandoffPayloadSchema.parse(payload); const bytes=new TextEncoder().encode(JSON.stringify(checked)); if(bytes.byteLength>HANDOFF_PAYLOAD_MAX_BYTES) throw new RangeError("Handoff payload exceeds QR ceiling"); return bytes; }
export function decodeHandoffPayload(bytes:Uint8Array):HandoffPayload { if(bytes.byteLength>HANDOFF_PAYLOAD_MAX_BYTES) throw new RangeError("Handoff payload exceeds QR ceiling"); return HandoffPayloadSchema.parse(JSON.parse(new TextDecoder().decode(bytes))); }
