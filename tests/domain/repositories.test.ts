import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import type { EventRepository } from "@/src/ports/EventRepository";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { feedEvent } from "./fixtures";

const RESTORED_AT = "2026-07-28T07:00:00.000Z";
async function repositoryContract(repository: EventRepository): Promise<void> {
  const first = feedEvent(); const second = feedEvent({ id: "event-feed-0002", babyId: "baby-2", startedAt: "2026-07-28T04:00:00.000Z", endedAt: "2026-07-28T04:20:00.000Z", createdAt: "2026-07-28T04:00:00.000Z", updatedAt: "2026-07-28T04:00:00.000Z" });
  expect(await repository.isEmpty()).toBe(true);
  await repository.append(second); await repository.append(first);
  expect(await repository.isEmpty()).toBe(false);
  await expect(repository.append(feedEvent({ id: "demo-feed-rejected", provenance: "demo" }))).rejects.toThrow(/cannot store/);
  const batchCandidate = feedEvent({ id: "event-feed-batch-candidate" });
  await expect(repository.appendBatch([batchCandidate, first])).rejects.toThrow(/exists/);
  expect(await repository.get("house-1", batchCandidate.id)).toBeNull();
  const duplicateBatch = feedEvent({ id: "event-feed-batch-duplicate" });
  await expect(repository.appendBatch([duplicateBatch, duplicateBatch])).rejects.toThrow(/duplicated/);
  expect(await repository.get("house-1", duplicateBatch.id)).toBeNull();
  expect((await repository.list({ householdId: "house-1" })).map((event) => event.id)).toEqual([first.id, second.id]); expect(await repository.list({ householdId: "house-1", babyId: "baby-2", from: second.startedAt, to: second.startedAt })).toHaveLength(1);
  await repository.revise({ ...first, updatedAt: "2026-07-28T05:00:00.000Z", fields: { ...first.fields, volume: 4 } }); expect((await repository.get("house-1", first.id))?.updatedAt).toBe("2026-07-28T05:00:00.000Z");
  await repository.softDelete("house-1", first.id, "2026-07-28T06:00:00.000Z"); expect(await repository.list({ householdId: "house-1" })).toHaveLength(1); expect(await repository.list({ householdId: "house-1", includeDeleted: true })).toHaveLength(2);
  await repository.restore("house-1", first.id); expect(await repository.list({ householdId: "house-1" })).toHaveLength(2); expect((await repository.get("house-1", first.id))?.updatedAt).toBe(RESTORED_AT);
  expect(await repository.import("house-1", [first, feedEvent({ id: "event-feed-0003" }), feedEvent({ id: "demo-import-skip", provenance: "demo" })])).toEqual({ imported: 1, skipped: 2 });
  expect(await repository.export("house-1")).toHaveLength(3);
  const otherHousehold = feedEvent({ id: "other-household-primary-key", householdId: "house-2", babyId: "baby-2" });
  await repository.append(otherHousehold);
  const beforeConflict = await repository.export("house-1");
  await expect(repository.restoreSnapshot("house-1", [feedEvent({ id: otherHousehold.id })])).rejects.toThrow(/another household/);
  expect(await repository.export("house-1")).toEqual(beforeConflict);
  await repository.purgeAll("house-1");
  expect(await repository.export("house-1")).toHaveLength(0);
  expect(await repository.isEmpty()).toBe(false);
  await repository.purgeAll("house-2");
  expect(await repository.isEmpty()).toBe(true);
  const adopted = feedEvent({ id: "adopted-event", householdId: "adopted-household", babyId: "adopted-baby" });
  await repository.adoptSnapshot("adopted-household", [adopted]);
  expect(await repository.export("adopted-household")).toEqual([adopted]);
  await repository.restoreSnapshot("adopted-household", [feedEvent({ id: "replacement-event", householdId: "adopted-household", babyId: "adopted-baby" })]);
  expect((await repository.export("adopted-household")).map((event) => event.id)).toEqual(["replacement-event"]);
}
function rawDatabase(name: string): Dexie { const database = new Dexie(name); database.version(4).stores({ events: "id,householdId,babyId,startedAt,deletedAt,provenance,[householdId+startedAt],[householdId+babyId+startedAt]", quarantine: "&recordId,householdId,quarantinedAt" }); return database; }

describe("EventRepository conformance", () => {
  it("conforms in memory, including provenance isolation", async () => repositoryContract(new InMemoryEventRepository({ mode: "real", now: () => RESTORED_AT })));
  it("conforms in IndexedDB, including provenance isolation", async () => { const repository = new DexieEventRepository({ mode: "real", namespace: "contract-v2", now: () => RESTORED_AT }); try { await repositoryContract(repository); } finally { await repository.deleteDatabase(); } });
});

describe("Dexie quarantine and isolation", () => {
  it("keeps quarantine idempotent and source records non-destructive until repair", async () => {
    const repository = new DexieEventRepository({ mode: "real", namespace: "quarantine-repair", now: () => RESTORED_AT }); const raw = rawDatabase(repository.name); const corrupt = { ...feedEvent({ id: "corrupt-event-01" }), babyId: null };
    try {
      await raw.table("events").put(corrupt); expect(await repository.export("house-1")).toEqual([]); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 1 }); expect(await repository.export("house-1")).toEqual([]); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 1 }); expect(await raw.table("events").get(corrupt.id)).toEqual(corrupt);
      const summaries = await repository.listQuarantine("house-1"); expect(summaries).toHaveLength(1); expect(summaries[0]).not.toHaveProperty("payload"); expect(await repository.isEmpty()).toBe(false);
      await repository.repairQuarantined("house-1", corrupt.id, feedEvent({ id: corrupt.id })); expect(await repository.get("house-1", corrupt.id)).toMatchObject({ id: corrupt.id, babyId: "baby-1" }); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 0 });
    } finally { raw.close(); await repository.deleteDatabase(); }
  });
  it("blocks empty-realm adoption when quarantine exists and clears owned quarantine on restore", async () => {
    const repository = new DexieEventRepository({ mode: "real", namespace: "quarantine-adoption", now: () => RESTORED_AT }); const raw = rawDatabase(repository.name); const corrupt = { ...feedEvent({ id: "corrupt-event-adoption" }), babyId: null };
    try {
      await raw.table("events").put(corrupt); await repository.export("house-1");
      await expect(repository.adoptSnapshot("other-household", [feedEvent({ id: "foreign-adoption", householdId: "other-household", babyId: "other-baby" })])).rejects.toThrow(/empty repository/);
      await repository.restoreSnapshot("house-1", []);
      expect(await raw.table("events").get(corrupt.id)).toBeUndefined();
      expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 0 });
    } finally { raw.close(); await repository.deleteDatabase(); }
  });
  it("lets an owned quarantine record be replaced even when its raw household field is corrupt", async () => {
    const repository = new DexieEventRepository({ mode: "real", namespace: "quarantine-owned-conflict", now: () => RESTORED_AT }); const raw = rawDatabase(repository.name); const corrupt = { ...feedEvent({ id: "corrupt-owned-conflict" }), householdId: 42 };
    try {
      await raw.table("events").put(corrupt); expect(await repository.get("house-1", corrupt.id)).toBeNull();
      await repository.restoreSnapshot("house-1", [feedEvent({ id: corrupt.id })]);
      expect(await repository.get("house-1", corrupt.id)).toMatchObject({ id: corrupt.id, householdId: "house-1" });
      expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 0 });
    } finally { raw.close(); await repository.deleteDatabase(); }
  });
  it("purges household quarantine and its corrupt primary rows atomically", async () => {
    const repository = new DexieEventRepository({ mode: "real", namespace: "quarantine-purge", now: () => RESTORED_AT }); const raw = rawDatabase(repository.name); const corrupt = { ...feedEvent({ id: "corrupt-event-02" }), householdId: 42 };
    try { await raw.table("events").put(corrupt); expect(await repository.get("house-1", corrupt.id)).toBeNull(); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 1 }); await repository.purgeAll("house-1"); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 0 }); expect(await raw.table("events").get(corrupt.id)).toBeUndefined(); } finally { raw.close(); await repository.deleteDatabase(); }
  });
  it("discards quarantined rows only through an explicit operation", async () => {
    const repository = new DexieEventRepository({ mode: "real", namespace: "quarantine-discard", now: () => RESTORED_AT }); const raw = rawDatabase(repository.name); const corrupt = { ...feedEvent({ id: "corrupt-event-03" }), babyId: null };
    try { await raw.table("events").put(corrupt); await repository.export("house-1"); await repository.discardQuarantined("house-1", corrupt.id); expect(await raw.table("events").get(corrupt.id)).toBeUndefined(); expect(await repository.diagnostics("house-1")).toEqual({ quarantined: 0 }); } finally { raw.close(); await repository.deleteDatabase(); }
  });
  it("uses distinct real and demo databases", async () => { const real = new DexieEventRepository({ mode: "real", namespace: "isolation-v2" }); const demo = new DexieEventRepository({ mode: "demo", namespace: "isolation-v2" }); try { await real.append(feedEvent()); await demo.append(feedEvent({ id: "demo-feed-0001", provenance: "demo" })); expect(real.name).not.toBe(demo.name); expect(await real.export("house-1")).toHaveLength(1); expect(await demo.export("house-1")).toHaveLength(1); } finally { await real.deleteDatabase(); await demo.deleteDatabase(); } });
});