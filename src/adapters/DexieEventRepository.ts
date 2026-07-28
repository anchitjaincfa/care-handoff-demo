import Dexie, { type Table } from "dexie";
import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import type { EventQuery, EventRepository } from "@/src/ports/EventRepository";

export type RepositoryMode = "real" | "demo";
export type DexieRepositoryOptions = { mode: RepositoryMode; namespace?: string };
type QuarantineRecord = { recordId: string | null; quarantinedAt: string; reason: string; payload: unknown };

class CareDatabase extends Dexie {
  events!: Table<unknown, string>;
  quarantine!: Table<QuarantineRecord, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: "id,householdId,babyId,startedAt,deletedAt,[householdId+startedAt]", quarantine: "++key,recordId,quarantinedAt" });
    this.version(2).stores({ events: "id,householdId,babyId,startedAt,deletedAt,provenance,[householdId+startedAt],[householdId+babyId+startedAt]", quarantine: "++key,recordId,quarantinedAt" });
  }
}

function recordId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("id" in value)) return null;
  return typeof value.id === "string" ? value.id : null;
}

function householdId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("householdId" in value)) return null;
  return typeof value.householdId === "string" ? value.householdId : null;
}

function copy(event: CareEvent): CareEvent { return structuredClone(event); }

export function eventDatabaseName(options: DexieRepositoryOptions): string {
  const namespace = (options.namespace ?? "default").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `care-handoff-${namespace}-${options.mode}`;
}

export class DexieEventRepository implements EventRepository {
  readonly name: string;
  private readonly db: CareDatabase;

  constructor(private readonly options: DexieRepositoryOptions) {
    this.name = eventDatabaseName(options);
    this.db = new CareDatabase(this.name);
  }

  private assertMode(event: CareEvent): void {
    if (event.provenance !== this.options.mode) throw new Error(`A ${this.options.mode} repository cannot store ${event.provenance} records`);
  }

  private async quarantineInvalid(rows: unknown[]): Promise<CareEvent[]> {
    const valid: CareEvent[] = [];
    const invalid: QuarantineRecord[] = [];
    const ids: string[] = [];
    for (const row of rows) {
      const parsed = CareEventSchema.safeParse(row);
      if (parsed.success && parsed.data.provenance === this.options.mode) valid.push(parsed.data);
      else {
        const id = recordId(row);
        if (id) ids.push(id);
        invalid.push({ recordId: id, quarantinedAt: new Date().toISOString(), reason: parsed.success ? "provenance-mismatch" : parsed.error.message, payload: row });
      }
    }
    if (invalid.length) await this.db.transaction("rw", this.db.events, this.db.quarantine, async () => { await this.db.quarantine.bulkAdd(invalid); if (ids.length) await this.db.events.bulkDelete(ids); });
    return valid;
  }

  async list(query: EventQuery): Promise<CareEvent[]> {
    const rows = await this.db.events.where("householdId").equals(query.householdId).toArray();
    const events = await this.quarantineInvalid(rows);
    return events.filter((event) => (!query.babyId || event.babyId === query.babyId) && (!query.from || event.startedAt >= query.from) && (!query.to || event.startedAt <= query.to) && (query.includeDeleted || event.deletedAt === null))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)).map(copy);
  }

  async get(expectedHouseholdId: string, id: string): Promise<CareEvent | null> {
    const row = await this.db.events.get(id);
    if (!row || householdId(row) !== expectedHouseholdId) return null;
    return (await this.quarantineInvalid([row]))[0] ?? null;
  }

  async append(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event); this.assertMode(parsed); await this.db.events.add(copy(parsed));
  }

  async revise(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event); this.assertMode(parsed);
    const current = await this.get(parsed.householdId, parsed.id);
    if (!current) throw new Error(`Event ${parsed.id} does not exist`);
    if (current.createdAt !== parsed.createdAt) throw new Error("Revision cannot change createdAt");
    await this.db.events.put(copy(parsed));
  }

  async softDelete(expectedHouseholdId: string, id: string, deletedAt: string): Promise<void> {
    const current = await this.get(expectedHouseholdId, id); if (!current) throw new Error(`Event ${id} does not exist`);
    await this.db.events.put(CareEventSchema.parse({ ...current, deletedAt, updatedAt: deletedAt }));
  }

  async restore(expectedHouseholdId: string, id: string): Promise<void> {
    const current = await this.get(expectedHouseholdId, id); if (!current) throw new Error(`Event ${id} does not exist`);
    await this.db.events.put(CareEventSchema.parse({ ...current, deletedAt: null }));
  }

  async purgeAll(expectedHouseholdId: string): Promise<void> { await this.db.events.where("householdId").equals(expectedHouseholdId).delete(); }
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

  async diagnostics(): Promise<{ quarantined: number }> { return { quarantined: await this.db.quarantine.count() }; }
  close(): void { this.db.close(); }
  async deleteDatabase(): Promise<void> { this.db.close(); await Dexie.delete(this.name); }
}