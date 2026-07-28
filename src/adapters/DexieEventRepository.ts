import Dexie, { type Table } from "dexie";
import { CareEventSchema, UtcInstantSchema, type CareEvent } from "@/src/domain/types";
import type { EventQuery, EventRepository } from "@/src/ports/EventRepository";

export type RepositoryMode = "real" | "demo";
export type DexieRepositoryOptions = { mode: RepositoryMode; namespace?: string; now?: () => string };
type QuarantineRecord = { recordId: string; householdId: string; quarantinedAt: string; reason: string; payload: unknown };
export type QuarantineSummary = Omit<QuarantineRecord, "payload">;
const EVENT_INDEXES = "id,householdId,babyId,startedAt,deletedAt,provenance,[householdId+startedAt],[householdId+babyId+startedAt]";

class CareDatabase extends Dexie {
  events!: Table<unknown, string>;
  quarantine!: Table<QuarantineRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: "id,householdId,babyId,startedAt,deletedAt,[householdId+startedAt]", quarantine: "++key,recordId,quarantinedAt" });
    this.version(2).stores({ events: EVENT_INDEXES, quarantine: "++key,recordId,quarantinedAt" });
    this.version(3).stores({ events: EVENT_INDEXES, quarantine: null });
    this.version(4).stores({ events: EVENT_INDEXES, quarantine: "&recordId,householdId,quarantinedAt" });
  }
}

function stringField(value: unknown, field: "id" | "householdId"): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const fieldValue = (value as Record<string, unknown>)[field]; return typeof fieldValue === "string" ? fieldValue : null;
}
function copy(event: CareEvent): CareEvent { return structuredClone(event); }
export function eventDatabaseName(options: DexieRepositoryOptions): string { const namespace = (options.namespace ?? "default").replace(/[^a-zA-Z0-9_-]/g, "-"); return `care-handoff-${namespace}-${options.mode}`; }

export class DexieEventRepository implements EventRepository {
  readonly name: string;
  private readonly db: CareDatabase;
  private readonly currentInstant: () => string;
  constructor(private readonly options: DexieRepositoryOptions) { this.name = eventDatabaseName(options); this.db = new CareDatabase(this.name); this.currentInstant = options.now ?? (() => new Date().toISOString()); }

  private assertMode(event: CareEvent): void { if (event.provenance !== this.options.mode) throw new Error(`A ${this.options.mode} repository cannot store ${event.provenance} records`); }
  private validateBatch(events: CareEvent[], expectedHouseholdId?: string): CareEvent[] {
    const parsed = events.map((event) => CareEventSchema.parse(event));
    const ids = new Set<string>();
    for (const event of parsed) {
      this.assertMode(event);
      if (expectedHouseholdId && event.householdId !== expectedHouseholdId) throw new Error("Batch cannot mix households");
      if (ids.has(event.id)) throw new Error(`Event ${event.id} is duplicated within the batch`);
      ids.add(event.id);
    }
    return parsed.map(copy);
  }
  private async queryRows(query: EventQuery): Promise<unknown[]> {
    if (query.babyId) return this.db.events.where("[householdId+babyId+startedAt]").between([query.householdId, query.babyId, query.from ?? Dexie.minKey], [query.householdId, query.babyId, query.to ?? Dexie.maxKey], true, true).toArray();
    if (query.from || query.to) return this.db.events.where("[householdId+startedAt]").between([query.householdId, query.from ?? Dexie.minKey], [query.householdId, query.to ?? Dexie.maxKey], true, true).toArray();
    return this.db.events.where("householdId").equals(query.householdId).toArray();
  }

  private async quarantineInvalid(rows: unknown[], fallbackHouseholdId?: string): Promise<CareEvent[]> {
    const valid: CareEvent[] = []; const invalid: QuarantineRecord[] = [];
    for (const row of rows) {
      const parsed = CareEventSchema.safeParse(row);
      if (parsed.success && parsed.data.provenance === this.options.mode) { valid.push(parsed.data); continue; }
      const recordId = stringField(row, "id"); const householdId = stringField(row, "householdId") ?? fallbackHouseholdId;
      if (!recordId || !householdId) continue;
      invalid.push({ recordId, householdId, quarantinedAt: UtcInstantSchema.parse(this.currentInstant()), reason: parsed.success ? "provenance-mismatch" : parsed.error.message, payload: structuredClone(row) });
    }
    if (invalid.length) await this.db.transaction("rw", this.db.quarantine, async () => { for (const record of invalid) if (!await this.db.quarantine.get(record.recordId)) await this.db.quarantine.add(record); });
    return valid;
  }

  async list(query: EventQuery): Promise<CareEvent[]> {
    const events = await this.quarantineInvalid(await this.queryRows(query), query.householdId);
    return events.filter((event) => (query.includeDeleted || event.deletedAt === null))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)).map(copy);
  }
  async get(expectedHouseholdId: string, id: string): Promise<CareEvent | null> {
    const row = await this.db.events.get(id); if (!row) return null;
    const valid = (await this.quarantineInvalid([row], expectedHouseholdId))[0];
    return valid?.householdId === expectedHouseholdId ? copy(valid) : null;
  }
  async append(event: CareEvent): Promise<void> { await this.appendBatch([event]); }
  async appendBatch(events: CareEvent[]): Promise<void> {
    const parsed = this.validateBatch(events);
    await this.db.transaction("rw", this.db.events, async () => {
      const existing = parsed.length ? await this.db.events.bulkGet(parsed.map((event) => event.id)) : [];
      const conflict = existing.find((event) => event !== undefined);
      if (conflict) throw new Error(`Event ${stringField(conflict, "id") ?? "unknown"} already exists`);
      if (parsed.length) await this.db.events.bulkAdd(parsed);
    });
  }
  async revise(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event); this.assertMode(parsed); const current = await this.get(parsed.householdId, parsed.id);
    if (!current) throw new Error(`Event ${parsed.id} does not exist`); if (current.createdAt !== parsed.createdAt) throw new Error("Revision cannot change createdAt"); await this.db.events.put(copy(parsed));
  }
  async softDelete(expectedHouseholdId: string, id: string, deletedAt: string): Promise<void> { const current = await this.get(expectedHouseholdId, id); if (!current) throw new Error(`Event ${id} does not exist`); await this.db.events.put(CareEventSchema.parse({ ...current, deletedAt, updatedAt: deletedAt })); }
  async restore(expectedHouseholdId: string, id: string): Promise<void> { const current = await this.get(expectedHouseholdId, id); if (!current) throw new Error(`Event ${id} does not exist`); const restoredAt = UtcInstantSchema.parse(this.currentInstant()); await this.db.events.put(CareEventSchema.parse({ ...current, deletedAt: null, updatedAt: restoredAt })); }

  async purgeAll(expectedHouseholdId: string): Promise<void> {
    await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => {
      const quarantined = await this.db.quarantine.where("householdId").equals(expectedHouseholdId).toArray();
      if (quarantined.length) await this.db.events.bulkDelete(quarantined.map((record) => record.recordId));
      await this.db.events.where("householdId").equals(expectedHouseholdId).delete();
      await this.db.quarantine.where("householdId").equals(expectedHouseholdId).delete();
    });
  }
  async export(expectedHouseholdId: string): Promise<CareEvent[]> { return this.list({ householdId: expectedHouseholdId, includeDeleted: true }); }
  async import(expectedHouseholdId: string, events: CareEvent[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0; let skipped = 0;
    await this.db.transaction("rw", this.db.events, async () => {
      for (const event of events) {
        const parsed = CareEventSchema.safeParse(event);
        if (!parsed.success || parsed.data.householdId !== expectedHouseholdId || parsed.data.provenance !== this.options.mode || await this.db.events.get(parsed.success ? parsed.data.id : "")) { skipped += 1; continue; }
        await this.db.events.add(copy(parsed.data)); imported += 1;
      }
    });
    return { imported, skipped };
  }

  async isEmpty(): Promise<boolean> {
    return this.db.transaction("r", this.db.events, this.db.quarantine, async () =>
      await this.db.events.count() === 0 && await this.db.quarantine.count() === 0);
  }
  async restoreSnapshot(expectedHouseholdId: string, events: CareEvent[]): Promise<void> {
    const parsed = this.validateBatch(events, expectedHouseholdId);
    const ids = parsed.map((event) => event.id);
    await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => {
      const [existingEvents, existingQuarantine] = await Promise.all([
        ids.length ? this.db.events.bulkGet(ids) : Promise.resolve([]),
        ids.length ? this.db.quarantine.bulkGet(ids) : Promise.resolve([]),
      ]);
      for (const row of existingEvents) if (row !== undefined && stringField(row, "householdId") !== expectedHouseholdId) throw new Error("Snapshot conflicts with another household");
      for (const row of existingQuarantine) if (row !== undefined && row.householdId !== expectedHouseholdId) throw new Error("Snapshot conflicts with another household quarantine");
      const quarantined = await this.db.quarantine.where("householdId").equals(expectedHouseholdId).toArray();
      if (quarantined.length) await this.db.events.bulkDelete(quarantined.map((record) => record.recordId));
      await this.db.events.where("householdId").equals(expectedHouseholdId).delete();
      await this.db.quarantine.where("householdId").equals(expectedHouseholdId).delete();
      if (parsed.length) await this.db.events.bulkAdd(parsed);
    });
  }
  async adoptSnapshot(expectedHouseholdId: string, events: CareEvent[]): Promise<void> {
    const parsed = this.validateBatch(events, expectedHouseholdId);
    await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => {
      if (await this.db.events.count() !== 0 || await this.db.quarantine.count() !== 0) throw new Error("A different household can only be restored into an empty repository");
      if (parsed.length) await this.db.events.bulkAdd(parsed);
    });
  }

  async listQuarantine(expectedHouseholdId: string): Promise<QuarantineSummary[]> {
    const rows = await this.db.quarantine.where("householdId").equals(expectedHouseholdId).sortBy("quarantinedAt");
    return rows.map(({ recordId, householdId, quarantinedAt, reason }) => ({ recordId, householdId, quarantinedAt, reason }));
  }
  async repairQuarantined(expectedHouseholdId: string, recordId: string, replacement: CareEvent): Promise<void> {
    const record = await this.db.quarantine.get(recordId); if (!record || record.householdId !== expectedHouseholdId) throw new Error(`Quarantined event ${recordId} does not exist`);
    const parsed = CareEventSchema.parse(replacement); this.assertMode(parsed);
    if (parsed.id !== recordId || parsed.householdId !== expectedHouseholdId) throw new Error("Repair must preserve event and household identifiers");
    await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => { await this.db.events.put(copy(parsed)); await this.db.quarantine.delete(recordId); });
  }
  async discardQuarantined(expectedHouseholdId: string, recordId: string): Promise<void> {
    const record = await this.db.quarantine.get(recordId); if (!record || record.householdId !== expectedHouseholdId) throw new Error(`Quarantined event ${recordId} does not exist`);
    await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => { await this.db.events.delete(recordId); await this.db.quarantine.delete(recordId); });
  }
  async diagnostics(expectedHouseholdId?: string): Promise<{ quarantined: number }> { return { quarantined: expectedHouseholdId ? await this.db.quarantine.where("householdId").equals(expectedHouseholdId).count() : await this.db.quarantine.count() }; }
  close(): void { this.db.close(); }
  async deleteDatabase(): Promise<void> { this.db.close(); await Dexie.delete(this.name); }
}