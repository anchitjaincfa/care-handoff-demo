import type { DataRealm } from "@/src/infrastructure/storage/names";
import { IdentityMutationLockUnavailableError, type IdentityMutationLock } from "@/src/ports/IdentityMutationLock";

type BrowserLockManager = Pick<LockManager, "request">;

export function identityMutationLockName(realm: DataRealm): string { return `nuzzlecue-identity-${realm}`; }

export class BrowserIdentityMutationLock implements IdentityMutationLock {
  private readonly manager: BrowserLockManager | undefined;
  constructor(manager?: BrowserLockManager) {
    this.manager = manager ?? (typeof navigator === "undefined" ? undefined : navigator.locks);
  }
  get available(): boolean { return Boolean(this.manager?.request); }
  async runExclusive<T>(realm: DataRealm, work: () => Promise<T>): Promise<T> {
    if (!this.manager?.request) throw new IdentityMutationLockUnavailableError();
    return this.manager.request(identityMutationLockName(realm), { mode: "exclusive" }, () => work());
  }
}
