export type DataRealm = "real" | "demo";

const REALM_PATTERN = /^[a-z][a-z0-9-]*$/;

export function scopedStorageName(baseName: string, realm: DataRealm): string {
  if (!REALM_PATTERN.test(baseName)) {
    throw new TypeError("Storage base name must use lowercase letters, digits, and hyphens");
  }
  return `${baseName}-${realm}`;
}

export function assertRealmAccess(activeRealm: DataRealm, requestedRealm: DataRealm): void {
  if (activeRealm !== requestedRealm) {
    throw new Error(`Cross-realm data access blocked: ${activeRealm} cannot open ${requestedRealm}`);
  }
}

export function createRealmGuard(activeRealm: DataRealm) {
  return {
    activeRealm,
    storageName(baseName: string) {
      return scopedStorageName(baseName, activeRealm);
    },
    assertAccess(requestedRealm: DataRealm) {
      assertRealmAccess(activeRealm, requestedRealm);
    },
  } as const;
}
