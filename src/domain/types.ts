import { z } from "zod";

const utcInstant = z.string().datetime({ offset: true });
const eventBase = z.object({
  id: z.string().min(8), householdId: z.string().min(1), babyId: z.string().min(1),
  startedAt: utcInstant, endedAt: utcInstant.nullable().optional(), timeZone: z.string().min(1),
  enteredWallClock: z.string().min(1), createdAt: utcInstant, updatedAt: utcInstant,
  deletedAt: utcInstant.nullable().default(null), schemaVersion: z.literal(1),
  source: z.enum(["typed", "voice", "manual", "import", "demo"]), note: z.string().max(500).optional(),
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

export const ProposedEventSchema = z.object({
  clientId: z.string().min(1), type: z.enum(["feed", "sleep", "diaper"]), babyId: z.string().nullable(),
  startedAt: utcInstant.nullable(), endedAt: utcInstant.nullable().optional(), timeZone: z.string(),
  fields: z.record(z.string(), z.unknown()), note: z.string().optional(), confidence: z.number().min(0).max(1),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)), assumptions: z.array(z.string()), unresolved: z.array(z.string()), sourceText: z.string(),
});
export type ProposedEvent = z.infer<typeof ProposedEventSchema>;
