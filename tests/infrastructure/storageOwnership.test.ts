import { describe, expect, it } from "vitest";
import {
  appLocalStorageKey,
  isAppOwnedCacheName,
  isAppOwnedDatabaseName,
  isAppOwnedLocalStorageKey,
} from "@/src/infrastructure/storage/ownership";
import { DATA_GENERATION_STORAGE_KEY, realmDataGenerationStorageKey } from "@/src/infrastructure/storage/names";

describe("storage ownership", () => {
  it("derives local keys from the shared namespace", () => {
    expect(appLocalStorageKey("real-profile")).toBe("care-handoff-default-real-profile");
    expect(() => appLocalStorageKey("../profile")).toThrow(TypeError);
  });

  it("recognizes only explicit app-owned storage", () => {
    expect(isAppOwnedCacheName("nuzzlecue-shell-build-id")).toBe(true);
    expect(isAppOwnedCacheName("unrelated-cache")).toBe(false);
    expect(isAppOwnedDatabaseName("care-handoff-default-real")).toBe(true);
    expect(isAppOwnedDatabaseName("care-handoff-household-real")).toBe(false);
    expect(isAppOwnedDatabaseName("unrelated-origin-db")).toBe(false);
    expect(isAppOwnedLocalStorageKey("nuzzlecue-reduced-motion")).toBe(true);
    expect(isAppOwnedLocalStorageKey(DATA_GENERATION_STORAGE_KEY)).toBe(false);
    expect(isAppOwnedLocalStorageKey(realmDataGenerationStorageKey("real"))).toBe(false);
    expect(isAppOwnedLocalStorageKey(realmDataGenerationStorageKey("demo"))).toBe(false);
    expect(isAppOwnedLocalStorageKey("unrelated-origin-setting")).toBe(false);
  });
});
