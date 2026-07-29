import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { BrowserClockPort } from "@/src/infrastructure/clock/BrowserClockPort";
import { IndexedDbMetricsPort } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import { deleteAllLocalData, deleteRealmLocalData } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { BrowserSpeechPort } from "@/src/infrastructure/speech/BrowserSpeechPort";
import {
  BrowserProfileSchema,
  BrowserProfileStore,
  createDefaultProfile,
  type BrowserProfile,
  type ProfileStore,
} from "@/src/infrastructure/storage/BrowserProfileStore";
import { BrowserDataGenerationStore } from "@/src/infrastructure/storage/BrowserDataGenerationStore";
import { BrowserIdentityMutationLock } from "@/src/infrastructure/storage/BrowserIdentityMutationLock";
import { BrowserStoragePort } from "@/src/infrastructure/storage/BrowserStoragePort";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import type { DataRealm } from "@/src/infrastructure/storage/names";
import { DataGenerationMismatchError, INITIAL_DATA_GENERATION, sameDataGeneration, type DataGenerationSnapshot, type DataGenerationStore } from "@/src/ports/DataGenerationStore";
import type { MetricsPort } from "@/src/ports/MetricsPort";
import type { StoragePort } from "@/src/ports/StoragePort";
import { createExperienceRuntime, type ExperienceRuntime, type RuntimeDownload } from "./ExperienceRuntime";

export type BrowserExperienceRuntimeOptions = {
  mode?: DataRealm;
  passFragment?: string;
  namespace?: "default";
  /**
   * Builds a pass-only runtime with ephemeral ports. It never opens the
   * real/demo event databases, profile storage, or metrics database.
   */
  viewerOnly?: boolean;
};

async function browserDownload(download: RuntimeDownload): Promise<void> {
  const url = URL.createObjectURL(download.data);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.name;
    anchor.rel = "noopener";
    anchor.click();
  } finally { URL.revokeObjectURL(url); }
}

function browserGlobals(requireLocalData: boolean): { storage?: Storage; origin: string; fragment: string } {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") throw new Error();
    let storage: Storage | undefined;
    try { storage = globalThis.localStorage; } catch { storage = undefined; }
    if (requireLocalData && (!globalThis.indexedDB || !storage)) throw new Error();
    return {
      ...(storage ? { storage } : {}),
      origin: globalThis.location.origin,
      fragment: globalThis.location.hash,
    };
  } catch {
    throw new Error(requireLocalData
      ? "Browser runtime creation requires a client environment with localStorage and IndexedDB."
      : "Pass viewer creation requires a client browser environment.");
  }
}

function legacyPreferences(storage: Storage | undefined): BrowserProfile["preferences"] {
  const read = (key: string) => {
    try { return storage?.getItem(key) === "true"; } catch { return false; }
  };
  return { nursery: read("nuzzlecue-nursery-theme"), reducedMotion: read("nuzzlecue-reduced-motion") };
}

function ephemeralProfileStore(mode: DataRealm, timeZone: string, preferences: BrowserProfile["preferences"]): ProfileStore {
  let profile = { ...createDefaultProfile(mode, timeZone), preferences: { ...preferences } };
  return {
    realm: mode,
    read: () => structuredClone(profile),
    write: (candidate: BrowserProfile) => {
      const parsed = BrowserProfileSchema.parse(candidate);
      if (parsed.realm !== mode) throw new Error("Cross-realm profile write blocked");
      profile = structuredClone(parsed);
    },
    clear: () => { profile = { ...createDefaultProfile(mode, timeZone), preferences: { ...preferences } }; },
  };
}

function ephemeralDataGenerationStore(realm: DataRealm): DataGenerationStore {
  let generation: DataGenerationSnapshot = { global: INITIAL_DATA_GENERATION, realm: INITIAL_DATA_GENERATION };
  const rotate = (expected: DataGenerationSnapshot, target: "global" | "realm") => {
    if (!sameDataGeneration(generation, expected)) throw new DataGenerationMismatchError();
    generation = { ...generation, [target]: "viewer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) };
    return generation;
  };
  return { realm, read: () => ({ ...generation }), rotateRealm: (expected) => rotate(expected, "realm"), rotateGlobal: (expected) => rotate(expected, "global") };
}

const VIEWER_METRICS: MetricsPort = {
  record: async () => undefined,
  list: async () => [],
  exportJson: async () => JSON.stringify({ entries: [] }),
  clear: async () => undefined,
};

const VIEWER_STORAGE: StoragePort = {
  requestPersistence: async () => false,
  status: async () => ({ persisted: false }),
  clearApplicationCaches: async () => undefined,
};

export function createBrowserExperienceRuntime(options: BrowserExperienceRuntimeOptions = {}): ExperienceRuntime {
  if (options.namespace && options.namespace !== "default") throw new Error("Custom production namespaces are disabled until deletion registry support is available.");
  const viewerOnly = options.viewerOnly === true;
  const browser = browserGlobals(!viewerOnly);
  const mode = options.mode ?? "real";
  const profileStorage = browser.storage;
  const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const preferences = legacyPreferences(profileStorage);
  const profileStore = viewerOnly
    ? ephemeralProfileStore(mode, detectedTimeZone, preferences)
    : new BrowserProfileStore(mode, profileStorage, detectedTimeZone, preferences);
  // Pass-only tabs watch every realm fence without opening durable ports or gaining token-write access.
  const dataGenerationStore = profileStorage
    ? new BrowserDataGenerationStore(mode, profileStorage, undefined, undefined, viewerOnly ? { watchAllRealms: true, readOnly: true } : {})
    : ephemeralDataGenerationStore(mode);
  const clock = new BrowserClockPort({ timeZone: () => profileStore.read().timeZone });
  const durableRepository = viewerOnly
    ? null
    : new DexieEventRepository({ mode, namespace: options.namespace, now: () => clock.now() });
  const repository = durableRepository ?? new InMemoryEventRepository({ mode, now: () => clock.now() });
  const unregisterRepository = durableRepository
    ? registerClosableLocalConnection(durableRepository)
    : () => undefined;
  const metrics = viewerOnly ? VIEWER_METRICS : new IndexedDbMetricsPort(mode);
  return createExperienceRuntime({
    mode,
    repository,
    profileStore,
    dataGenerationStore,
    identityLock: new BrowserIdentityMutationLock(),
    clock,
    speech: new BrowserSpeechPort(),
    storage: viewerOnly ? VIEWER_STORAGE : new BrowserStoragePort(),
    metrics,
    origin: browser.origin,
    passFragment: options.passFragment ?? browser.fragment,
    download: browserDownload,
    copyText: async (value) => {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await globalThis.navigator.clipboard.writeText(value);
    },
    deleteAllData: viewerOnly
      ? async () => undefined
      : mode === "demo"
        ? () => deleteRealmLocalData(mode)
        : () => deleteAllLocalData(),
    clearAllProfiles: viewerOnly || !profileStorage
      ? () => undefined
      : mode === "demo"
        ? () => profileStore.clear()
        : () => BrowserProfileStore.clearAllApplicationProfiles(profileStorage),
    onDispose: unregisterRepository,
  });
}
