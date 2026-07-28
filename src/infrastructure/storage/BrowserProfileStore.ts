import { z } from "zod";
import { DATA_REALMS, scopedStorageName, type DataRealm } from "@/src/infrastructure/storage/names";
import type { EventType } from "@/src/domain/types";

const EventTypeSchema = z.enum(["feed", "sleep", "diaper", "pumping", "solids", "tummy-time"]);

export const BrowserProfileSchema = z.object({
  version: z.literal(1),
  realm: z.enum(["real", "demo"]),
  householdId: z.string().min(1),
  babyId: z.string().min(1),
  nickname: z.string().min(1).max(40),
  timeZone: z.string().min(1),
  locale: z.string().min(2).max(35),
  volumeUnit: z.enum(["oz", "ml"]),
  tracked: z.array(EventTypeSchema),
  dayBoundary: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  onboardingComplete: z.boolean(),
  preferences: z.object({ nursery: z.boolean(), reducedMotion: z.boolean() }).strict(),
}).strict();

export type BrowserProfile = z.infer<typeof BrowserProfileSchema>;

export interface ProfileStore {
  readonly realm: DataRealm;
  read(): BrowserProfile;
  write(profile: BrowserProfile): void;
  clear(): void;
}

const BASE_NAME = "nuzzlecue-profile";

export function profileStorageKey(realm: DataRealm): string {
  return scopedStorageName(BASE_NAME, realm);
}

export function createDefaultProfile(realm: DataRealm, timeZone = "UTC"): BrowserProfile {
  return BrowserProfileSchema.parse({
    version: 1,
    realm,
    householdId: `${realm}-household`,
    babyId: `${realm}-baby`,
    nickname: realm === "demo" ? "Demo baby" : "Baby",
    timeZone,
    locale: "en-US",
    volumeUnit: "oz",
    tracked: ["feed", "sleep", "diaper"] satisfies EventType[],
    dayBoundary: "04:00",
    onboardingComplete: realm === "demo",
    preferences: { nursery: false, reducedMotion: false },
  });
}

export class BrowserProfileStore implements ProfileStore {
  readonly key: string;

  constructor(
    readonly realm: DataRealm,
    private readonly storage: Storage = globalThis.localStorage,
    private readonly fallbackTimeZone = "UTC",
  ) {
    this.key = profileStorageKey(realm);
  }

  read(): BrowserProfile {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return createDefaultProfile(this.realm, this.fallbackTimeZone);
    try {
      const parsed = BrowserProfileSchema.parse(JSON.parse(raw));
      if (parsed.realm !== this.realm) throw new Error("Profile realm does not match its storage scope");
      return structuredClone(parsed);
    } catch {
      this.storage.removeItem(this.key);
      return createDefaultProfile(this.realm, this.fallbackTimeZone);
    }
  }

  write(profile: BrowserProfile): void {
    const parsed = BrowserProfileSchema.parse(profile);
    if (parsed.realm !== this.realm) throw new Error("Cross-realm profile write blocked");
    this.storage.setItem(this.key, JSON.stringify(parsed));
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }

  static clearAllApplicationProfiles(storage: Storage = globalThis.localStorage): void {
    for (const realm of DATA_REALMS) storage.removeItem(profileStorageKey(realm));
  }
}
