import type { DataRealm } from "@/src/infrastructure/storage/names";

export class IdentityMutationLockUnavailableError extends Error {
  constructor() { super("A trustworthy browser-wide identity lock is unavailable"); this.name = "IdentityMutationLockUnavailableError"; }
}

export interface IdentityMutationLock {
  readonly available: boolean;
  runExclusive<T>(realm: DataRealm, work: () => Promise<T>): Promise<T>;
}
