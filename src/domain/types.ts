import { z } from "zod";

export const UtcInstantSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "Z-normalized, fixed millisecond precision");
const eventBase = z.object({
  id: z.string().min(8), householdId: z.string().min(1), babyId: z.string().min(1),
  startedAt: UtcInstantSchema, endedAt: UtcInstantSchema.nullable().optional(), timeZone: z.string().min(1),
  enteredWallClock: z.string().min(1), createdAt: UtcInstantSchema, updatedAt: UtcInstantSchema,
  deletedAt: UtcInstantSchema.nullable().default(null), schemaVersion: z.literal(1),
  captureMethod: z.enum(["typed", "voice", "manual", "import"]), provenance: z.enum(["real", "demo"]),
});

export const FeedEventSchema = eventBase.extend({ type: z.literal("feed"), fields: z.object({ mode: z.enum(["nursing", "bottle"]), side: z.enum(["left", "right", "both"]).optional(), durationMinutes: z.number().nonnegative().optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional(), contents: z.enum(["breastmilk", "formula", "mixed"]).optional() }) });
export const SleepEventSchema = eventBase.extend({ type: z.literal("sleep"), fields: z.object({ kind: z.enum(["nap", "night", "unspecified"]).default("unspecified") }) });
export const DiaperEventSchema = eventBase.extend({ type: z.literal("diaper"), fields: z.object({ kind: z.enum(["wet", "dirty", "both", "dry"]) }) });
export const PumpingEventSchema = eventBase.extend({ type: z.literal("pumping"), fields: z.object({ durationMinutes: z.number().nonnegative().optional(), volume: z.number().positive().optional(), unit: z.enum(["oz", "ml"]).optional() }) });
export const SolidsEventSchema = eventBase.extend({ type: z.literal("solids"), fields: z.object({ food: z.string().min(1).max(120) }) });
export const TummyTimeEventSchema = eventBase.extend({ type: z.literal("tummy-time"), fields: z.object({ durationMinutes: z.number().positive() }) });
export const CareEventSchema = z.discriminatedUnion("type", [FeedEventSchema, SleepEventSchema, DiaperEventSchema, PumpingEventSchema, SolidsEventSchema, TummyTimeEventSchema]);
export type CareEvent = z.infer<typeof CareEventSchema>;
export type EventType = CareEvent["type"];

const proposedBase = z.object({ clientId: z.string().min(1), sourceText: z.string() });
export const ProposedEventSchema = proposedBase.extend({
  outcome: z.literal("proposed"), type: z.enum(["feed", "sleep", "diaper"]), babyId: z.string().nullable(),
  startedAt: UtcInstantSchema.nullable(), endedAt: UtcInstantSchema.nullable().optional(), timeZone: z.string(),
  fields: z.record(z.string(), z.unknown()), confidence: z.number().min(0).max(1),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)), assumptions: z.array(z.string()), unresolved: z.array(z.string()),
});
export const RefusedParseSchema = proposedBase.extend({ outcome: z.literal("refused"), refusalReason: z.enum(["unsupported", "ambiguous", "unsafe", "empty"]), explanation: z.string().min(1) });
export const ParseOutcomeSchema = z.discriminatedUnion("outcome", [ProposedEventSchema, RefusedParseSchema]);
export type ProposedEvent = z.infer<typeof ProposedEventSchema>;
export type ParseOutcome = z.infer<typeof ParseOutcomeSchema>;
