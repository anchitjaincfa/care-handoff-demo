import { DATA_GENERATION_STORAGE_KEY, KNOWN_APP_DATABASE_NAMES, STORAGE_NAMESPACE } from "@/src/infrastructure/storage/names";

export type LocalStorageLike = Pick<Storage, "key" | "length" | "removeItem">;

export const APP_CACHE_PREFIXES = ["nuzzlecue-shell-"] as const;
export const APP_LOCAL_STORAGE_PREFIXES = [`care-handoff-${STORAGE_NAMESPACE}-`, "nuzzlecue-"] as const;

const KEY_SUFFIX = /^[a-z0-9][a-z0-9-]*$/;

export function appLocalStorageKey(suffix: string): string {
  if (!KEY_SUFFIX.test(suffix)) throw new TypeError("Storage key suffix must use lowercase letters, digits, and hyphens");
  return `${APP_LOCAL_STORAGE_PREFIXES[0]}${suffix}`;
}

export function isAppOwnedCacheName(name: string): boolean {
  return APP_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// Ownership is deliberately enumerated, never prefix-matched. This release locks the
// default namespace; supporting another namespace requires a reviewed names manifest,
// generated-worker update, and matching runtime validation before it may be deleted.
export function isAppOwnedDatabaseName(name: string): boolean {
  return KNOWN_APP_DATABASE_NAMES.includes(name as (typeof KNOWN_APP_DATABASE_NAMES)[number]);
}

export function isAppOwnedLocalStorageKey(key: string): boolean {
  // The generation fence must survive deletion so a stale tab can observe the rotation.
  if (key === DATA_GENERATION_STORAGE_KEY) return false;
  return APP_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function browserLocalStorage(): LocalStorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function clearAppOwnedLocalStorage(storage: LocalStorageLike | undefined = browserLocalStorage()): number {
  if (!storage) return 0;
  const owned: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isAppOwnedLocalStorageKey(key)) owned.push(key);
  }
  for (const key of owned) storage.removeItem(key);
  return owned.length;
}
