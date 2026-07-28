import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { BrowserClockPort } from "@/src/infrastructure/clock/BrowserClockPort";
import { IndexedDbMetricsPort } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import { deleteAllLocalData } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { BrowserSpeechPort } from "@/src/infrastructure/speech/BrowserSpeechPort";
import { BrowserProfileStore } from "@/src/infrastructure/storage/BrowserProfileStore";
import { BrowserStoragePort } from "@/src/infrastructure/storage/BrowserStoragePort";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import type { DataRealm } from "@/src/infrastructure/storage/names";
import { createExperienceRuntime, type ExperienceRuntime, type RuntimeDownload } from "./ExperienceRuntime";

export type BrowserExperienceRuntimeOptions = {
  mode?: DataRealm;
  passFragment?: string;
  namespace?: "default";
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

function browserGlobals(): { storage: Storage; origin: string; fragment: string } {
  try {
    if (typeof window === "undefined" || typeof document === "undefined" || !globalThis.indexedDB || !globalThis.localStorage) throw new Error();
    return { storage: globalThis.localStorage, origin: globalThis.location.origin, fragment: globalThis.location.hash };
  } catch {
    throw new Error("Browser runtime creation requires a client environment with localStorage and IndexedDB.");
  }
}

export function createBrowserExperienceRuntime(options: BrowserExperienceRuntimeOptions = {}): ExperienceRuntime {
  if (options.namespace && options.namespace !== "default") throw new Error("Custom production namespaces are disabled until deletion registry support is available.");
  const browser = browserGlobals();
  const mode = options.mode ?? "real";
  const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const profileStore = new BrowserProfileStore(mode, browser.storage, detectedTimeZone);
  const clock = new BrowserClockPort({ timeZone: () => profileStore.read().timeZone });
  const repository = new DexieEventRepository({ mode, namespace: options.namespace, now: () => clock.now() });
  const unregisterRepository = registerClosableLocalConnection(repository);
  const metrics = new IndexedDbMetricsPort(mode);
  return createExperienceRuntime({
    mode,
    repository,
    profileStore,
    clock,
    speech: new BrowserSpeechPort(),
    storage: new BrowserStoragePort(),
    metrics,
    origin: browser.origin,
    passFragment: options.passFragment ?? browser.fragment,
    download: browserDownload,
    copyText: async (value) => {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await globalThis.navigator.clipboard.writeText(value);
    },
    deleteAllData: () => deleteAllLocalData(),
    clearAllProfiles: () => BrowserProfileStore.clearAllApplicationProfiles(browser.storage),
    requestDeleteConfirmation: () => globalThis.prompt?.("Type DELETE to remove all local NuzzleCue data.") ?? null,
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
