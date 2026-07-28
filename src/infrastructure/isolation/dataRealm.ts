import { scopedStorageName, type DataRealm } from "@/src/infrastructure/storage/names";
export type { DataRealm } from "@/src/infrastructure/storage/names";
export { scopedStorageName } from "@/src/infrastructure/storage/names";
export function assertRealmAccess(activeRealm: DataRealm, requestedRealm: DataRealm): void {
  if (activeRealm !== requestedRealm) throw new Error(`Cross-realm data access blocked: ${activeRealm} cannot open ${requestedRealm}`);
}
export function createRealmGuard(activeRealm: DataRealm) {
  return {
    activeRealm,
    storageName: (baseName: string) => scopedStorageName(baseName, activeRealm),
    assertAccess: (requestedRealm: DataRealm) => assertRealmAccess(activeRealm, requestedRealm),
  } as const;
}
