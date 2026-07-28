import { describe, expect, it } from "vitest";
import {
  assertRealmAccess,
  createRealmGuard,
  scopedStorageName,
} from "@/src/infrastructure/isolation/dataRealm";

describe("demo and real data isolation", () => {
  it("always assigns distinct physical storage names", () => {
    expect(scopedStorageName("care-events", "real")).toBe("care-events-real");
    expect(scopedStorageName("care-events", "demo")).toBe("care-events-demo");
  });

  it("blocks cross-realm access before an adapter opens storage", () => {
    expect(() => assertRealmAccess("real", "demo")).toThrow("Cross-realm data access blocked");
    expect(() => assertRealmAccess("demo", "real")).toThrow("Cross-realm data access blocked");
    expect(() => assertRealmAccess("real", "real")).not.toThrow();
  });

  it("provides a realm-bound integration guard", () => {
    const demo = createRealmGuard("demo");
    expect(demo.storageName("care-events")).toBe("care-events-demo");
    expect(() => demo.assertAccess("real")).toThrow();
  });
});
