import { describe, expect, it, vi } from "vitest";
import {
  BrowserIdentityMutationLock,
  dataMutationLockName,
  identityMutationLockName,
} from "@/src/infrastructure/storage/BrowserIdentityMutationLock";

describe("browser identity mutation lock", () => {
  it("acquires the global lock before the realm lock and releases in reverse order", async () => {
    const order: string[] = [];
    const request = vi.fn(async (name: string, _options: LockOptions, work: (lock: Lock | null) => unknown) => {
      order.push(`enter:${name}`);
      try { return await work({ name, mode: "exclusive" } as Lock); }
      finally { order.push(`exit:${name}`); }
    });
    const lock = new BrowserIdentityMutationLock({ request } as unknown as Pick<LockManager, "request">);

    await lock.runExclusive("real", async () => { order.push("work"); });

    expect(order).toEqual([
      `enter:${dataMutationLockName()}`,
      `enter:${identityMutationLockName("real")}`,
      "work",
      `exit:${identityMutationLockName("real")}`,
      `exit:${dataMutationLockName()}`,
    ]);
  });

  it("uses only the browser-wide lock for global deletion", async () => {
    const requested: string[] = [];
    const request = vi.fn(async (name: string, _options: LockOptions, work: (lock: Lock | null) => unknown) => {
      requested.push(name);
      return work({ name, mode: "exclusive" } as Lock);
    });
    const lock = new BrowserIdentityMutationLock({ request } as unknown as Pick<LockManager, "request">);

    await lock.runGlobalExclusive(async () => undefined);

    expect(requested).toEqual([dataMutationLockName()]);
  });

  it("fails closed when the Web Locks manager is unavailable", async () => {
    const lock = new BrowserIdentityMutationLock({} as Pick<LockManager, "request">);
    await expect(lock.runExclusive("real", async () => undefined)).rejects.toThrow(/identity lock is unavailable/);
    await expect(lock.runGlobalExclusive(async () => undefined)).rejects.toThrow(/identity lock is unavailable/);
  });
});
