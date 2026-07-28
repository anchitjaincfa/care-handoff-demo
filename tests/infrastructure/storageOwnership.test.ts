import { describe, expect, it } from "vitest";
import {
  appLocalStorageKey,
  isAppOwnedCacheName,
  isAppOwnedDatabaseName,
  isAppOwnedLocalStorageKey,
} from "@/src/infrastructure/storage/ownership";

describe("storage ownership", () => {
  it("derives local keys from the shared namespace", () => {
    expect(appLocalStorageKey("real-profile")).toBe("care-handoff-default-real-profile");
    expect(() => appLocalStorageKey("../profile")).toThrow(TypeError);
  });

  it("recognizes only explicit app-owned storage", () => {
    expect(isAppOwnedCacheName("nuzzlecue-shell-build-id")).toBe(true);
    expect(isAppOwnedCacheName("unrelated-cache")).toBe(false);
    expect(isAppOwnedDatabaseName("care-handoff-default-real")).toBe(true);
    expect(isAppOwnedDatabaseName("unrelated-origin-db")).toBe(false);
    expect(isAppOwnedLocalStorageKey("nuzzlecue-reduced-motion")).toBe(true);
    expect(isAppOwnedLocalStorageKey("unrelated-origin-setting")).toBe(false);
  });
});
