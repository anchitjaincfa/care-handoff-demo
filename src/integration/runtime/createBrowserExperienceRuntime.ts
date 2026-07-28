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
  namespace?: string;
  language?: string;
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

export function createBrowserExperienceRuntime(options: BrowserExperienceRuntimeOptions = {}): ExperienceRuntime {
  const mode = options.mode ?? "real";
  const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const profileStore = new BrowserProfileStore(mode, globalThis.localStorage, detectedTimeZone);
  const clock = new BrowserClockPort({ timeZone: () => profileStore.read().timeZone });
  const repository = new DexieEventRepository({ mode, namespace: options.namespace, now: () => clock.now() });
  registerClosableLocalConnection(repository);
  const metrics = new IndexedDbMetricsPort(mode);
  const runtime = createExperienceRuntime({
    mode,
    repository,
    profileStore,
    clock,
    speech: new BrowserSpeechPort(),
    storage: new BrowserStoragePort(),
    metrics,
    origin: globalThis.location?.origin ?? "",
    passFragment: options.passFragment ?? globalThis.location?.hash,
    download: browserDownload,
    copyText: async (value) => {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await globalThis.navigator.clipboard.writeText(value);
    },
    deleteAllData: () => deleteAllLocalData(),
    clearAllProfiles: () => BrowserProfileStore.clearAllApplicationProfiles(globalThis.localStorage),
    requestDeleteConfirmation: () => globalThis.prompt?.('Type DELETE to remove all local NuzzleCue data.') ?? null,
  });
  return runtime;
}
