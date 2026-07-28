import storageNames from "./names.json";
export type DataRealm = "real" | "demo";
export type DatabaseKind = keyof typeof storageNames.databases;
export const STORAGE_NAMESPACE = storageNames.namespace;
export const DATA_REALMS = storageNames.realms as readonly DataRealm[];
const PATTERN = /^[a-z][a-z0-9-]*$/;
export function scopedStorageName(baseName: string, realm: DataRealm): string {
  if (!PATTERN.test(baseName)) throw new TypeError("Storage base name must use lowercase letters, digits, and hyphens");
  return `${baseName}-${realm}`;
}
export function databaseName(kind: DatabaseKind, realm: DataRealm): string {
  return scopedStorageName(storageNames.databases[kind], realm);
}
export const EVENT_DATABASE_NAMES = DATA_REALMS.map((realm) => databaseName("events", realm));
export const METRICS_DATABASE_NAMES = DATA_REALMS.map((realm) => databaseName("metrics", realm));
export const LEGACY_EVENT_DATABASE_NAMES = storageNames.legacyEventBases.flatMap((base) =>
  DATA_REALMS.map((realm) => scopedStorageName(base, realm)),
);
export const KNOWN_APP_DATABASE_NAMES = [
  ...EVENT_DATABASE_NAMES,
  ...METRICS_DATABASE_NAMES,
  ...LEGACY_EVENT_DATABASE_NAMES,
] as const;
