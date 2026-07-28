import { DOMAIN_CAPABILITIES } from "./domain";
import { SURFACE_CAPABILITIES } from "./surfaces";

export * from "./types";
export { IndexedDbMetricsPort } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
export {
  deleteAllLocalData,
  requestServiceWorkerDataDeletion,
} from "@/src/infrastructure/privacy/deleteAllLocalData";
export {
  assertRealmAccess,
  createRealmGuard,
  scopedStorageName,
} from "@/src/infrastructure/isolation/dataRealm";
export type { DataRealm } from "@/src/infrastructure/isolation/dataRealm";

export const CAPABILITIES = [...DOMAIN_CAPABILITIES, ...SURFACE_CAPABILITIES];
