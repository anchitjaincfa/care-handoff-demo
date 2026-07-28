import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { EventRepository } from "@/src/ports/EventRepository";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { feedEvent } from "./fixtures";

async function repositoryContract(repository: EventRepository): Promise<void> {
  const first = feedEvent(); const second = feedEvent({ id: "event-feed-0002", babyId: "baby-2", startedAt: "2026-07-28T04:00:00.000Z", endedAt: "2026-07-28T04:20:00.000Z", createdAt: "2026-07-28T04:00:00.000Z", updatedAt: "2026-07-28T04:00:00.000Z" });
  await repository.append(second); await repository.append(first);
  expect((await repository.list({ householdId: "house-1" })).map((event) => event.id)).toEqual([first.id, second.id]);
  expect(await repository.list({ householdId: "house-1", babyId: "baby-2" })).toHaveLength(1);
  await repository.revise({ ...first, updatedAt: "2026-07-28T05:00:00.000Z", fields: { ...first.fields, volume: 4 } });
  expect((await repository.get("house-1", first.id))?.updatedAt).toBe("2026-07-28T05:00:00.000Z");
  await repository.softDelete("house-1", first.id, "2026-07-28T06:00:00.000Z"); expect(await repository.list({ householdId: "house-1" })).toHaveLength(1); expect(await repository.list({ householdId: "house-1", includeDeleted: true })).toHaveLength(2);
  await repository.restore("house-1", first.id); expect(await repository.list({ householdId: "house-1" })).toHaveLength(2);
  expect(await repository.import("house-1", [first, feedEvent({ id: "event-feed-0003" })])).toEqual({ imported: 1, skipped: 1 });
  expect(await repository.export("house-1")).toHaveLength(3); await repository.purgeAll("house-1"); expect(await repository.export("house-1")).toHaveLength(0);
}

describe("EventRepository conformance", () => {
  it("conforms in memory", async () => repositoryContract(new InMemoryEventRepository()));
  it("conforms in IndexedDB", async () => { const repository = new DexieEventRepository({ mode: "real", namespace: "contract" }); try { await repositoryContract(repository); } finally { await repository.deleteDatabase(); } });
});

describe("Dexie isolation and validation", () => {
  const repositories: DexieEventRepository[] = [];
  afterEach(async () => { await Promise.all(repositories.splice(0).map((repository) => repository.deleteDatabase())); });
  it("uses separate demo and real database names and records", async () => { const real = new DexieEventRepository({ mode: "real", namespace: "isolation" }); const demo = new DexieEventRepository({ mode: "demo", namespace: "isolation" }); repositories.push(real, demo); await real.append(feedEvent()); await demo.append(feedEvent({ id: "demo-feed-0001", provenance: "demo" })); expect(real.name).not.toBe(demo.name); expect(await real.export("house-1")).toHaveLength(1); expect(await demo.export("house-1")).toHaveLength(1); await expect(real.append(feedEvent({ id: "demo-feed-0002", provenance: "demo" }))).rejects.toThrow(/cannot store/); });
  it("rejects invalid events at the adapter boundary", async () => { const real = new DexieEventRepository({ mode: "real", namespace: "validation" }); repositories.push(real); await expect(real.append({ ...feedEvent(), id: "x" })).rejects.toThrow(); });
});