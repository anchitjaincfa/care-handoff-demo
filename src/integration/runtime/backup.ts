import { z } from "zod";
import { CareEventSchema, UtcInstantSchema, type CareEvent } from "@/src/domain/types";
import { BrowserProfileSchema, type BrowserProfile } from "@/src/infrastructure/storage/BrowserProfileStore";
import type { DataRealm } from "@/src/infrastructure/storage/names";

export const RuntimeBackupSchema = z.object({
  format: z.literal("nuzzlecue-backup"),
  version: z.literal(1),
  generatedAt: UtcInstantSchema,
  realm: z.enum(["real", "demo"]),
  profile: BrowserProfileSchema,
  events: z.array(CareEventSchema),
}).strict();

export type RuntimeBackup = z.infer<typeof RuntimeBackupSchema>;

function validateRelations(backup: RuntimeBackup, expectedRealm: DataRealm): RuntimeBackup {
  if (backup.realm !== expectedRealm || backup.profile.realm !== expectedRealm) throw new Error("Backup belongs to another data realm");
  for (const event of backup.events) {
    if (event.householdId !== backup.profile.householdId) throw new Error("Backup mixes households");
    if (event.babyId !== backup.profile.babyId) throw new Error("Backup mixes baby profiles");
    if (event.provenance !== expectedRealm) throw new Error("Backup mixes real and demo records");
  }
  return backup;
}

export function createRuntimeBackup(input: {
  generatedAt: string;
  realm: DataRealm;
  profile: BrowserProfile;
  events: CareEvent[];
}): RuntimeBackup {
  return validateRelations(RuntimeBackupSchema.parse({
    format: "nuzzlecue-backup",
    version: 1,
    generatedAt: input.generatedAt,
    realm: input.realm,
    profile: input.profile,
    events: [...input.events].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)),
  }), input.realm);
}

export function stringifyRuntimeBackup(input: Parameters<typeof createRuntimeBackup>[0]): string {
  return JSON.stringify(createRuntimeBackup(input), null, 2);
}

export function parseRuntimeBackup(text: string, expectedRealm: DataRealm): RuntimeBackup {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Backup is not valid JSON"); }
  return validateRelations(RuntimeBackupSchema.parse(value), expectedRealm);
}
