import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { BrowserClockPort } from "@/src/infrastructure/clock/BrowserClockPort";
import { IndexedDbMetricsPort } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import { deleteAllLocalData } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { BrowserSpeechPort } from "@/src/infrastructure/speech/BrowserSpeechPort";
import {
  BrowserProfileSchema,
  BrowserProfileStore,
  createDefaultProfile,
  type BrowserProfile,
  type ProfileStore,
} from "@/src/infrastructure/storage/BrowserProfileStore";
import { BrowserStoragePort } from "@/src/infrastructure/storage/BrowserStoragePort";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import type { DataRealm } from "@/src/infrastructure/storage/names";
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
    if (requireLocalData && (!globalThis.indexedDB || !globalThis.localStorage)) throw new Error();
    return {
      ...(requireLocalData ? { storage: globalThis.localStorage } : {}),
      origin: globalThis.location.origin,
      fragment: globalThis.location.hash,
    };
  } catch {
    throw new Error(requireLocalData
      ? "Browser runtime creation requires a client environment with localStorage and IndexedDB."
      : "Pass viewer creation requires a client browser environment.");
  }
}

function ephemeralProfileStore(mode: DataRealm, timeZone: string): ProfileStore {
  let profile = createDefaultProfile(mode, timeZone);
  return {
    realm: mode,
    read: () => structuredClone(profile),
    write: (candidate: BrowserProfile) => {
      const parsed = BrowserProfileSchema.parse(candidate);
      if (parsed.realm !== mode) throw new Error("Cross-realm profile write blocked");
      profile = structuredClone(parsed);
    },
    clear: () => { profile = createDefaultProfile(mode, timeZone); },
  };
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
  const profileStore = viewerOnly
    ? ephemeralProfileStore(mode, detectedTimeZone)
    : new BrowserProfileStore(mode, profileStorage, detectedTimeZone);
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
    deleteAllData: viewerOnly ? async () => undefined : () => deleteAllLocalData(),
    clearAllProfiles: viewerOnly || !profileStorage
      ? () => undefined
      : () => BrowserProfileStore.clearAllApplicationProfiles(profileStorage),
    requestQuickLogDetails: (kind) => {
      if (kind === "solids") {
        const food = globalThis.prompt?.("What food was offered?")?.trim();
        return food ? { food } : null;
      }
      const raw = globalThis.prompt?.("How many minutes of tummy time?")?.trim();
      if (!raw) return null;
      const durationMinutes = Number(raw);
      return Number.isFinite(durationMinutes) && durationMinutes > 0 ? { durationMinutes } : null;
    },
    onDispose: unregisterRepository,
  });
}
