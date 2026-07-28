import { CareEventSchema, UtcInstantSchema, type CareEvent } from "@/src/domain/types";
import type { EventQuery, EventRepository } from "@/src/ports/EventRepository";

export type InMemoryRepositoryOptions = { mode?: "real" | "demo"; now?: () => string };

function copy(event: CareEvent): CareEvent { return structuredClone(event); }
function matches(event: CareEvent, query: EventQuery): boolean {
  return event.householdId === query.householdId
    && (!query.babyId || event.babyId === query.babyId)
    && (!query.from || event.startedAt >= query.from)
    && (!query.to || event.startedAt <= query.to)
    && (query.includeDeleted || event.deletedAt === null);
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, CareEvent>();
  private readonly mode: "real" | "demo";
  private readonly currentInstant: () => string;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.mode = options.mode ?? "real";
    this.currentInstant = options.now ?? (() => new Date().toISOString());
  }

  private assertMode(event: CareEvent): void {
    if (event.provenance !== this.mode) throw new Error(`A ${this.mode} repository cannot store ${event.provenance} records`);
  }

  async list(query: EventQuery): Promise<CareEvent[]> {
    return [...this.events.values()].filter((event) => matches(event, query))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)).map(copy);
  }
  async get(householdId: string, id: string): Promise<CareEvent | null> { const event = this.events.get(id); return event?.householdId === householdId ? copy(event) : null; }

  async append(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event); this.assertMode(parsed);
    if (this.events.has(parsed.id)) throw new Error(`Event ${parsed.id} already exists`);
    this.events.set(parsed.id, copy(parsed));
  }
  async revise(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event); this.assertMode(parsed); const current = this.events.get(parsed.id);
    if (!current || current.householdId !== parsed.householdId) throw new Error(`Event ${parsed.id} does not exist`);
    if (current.createdAt !== parsed.createdAt) throw new Error("Revision cannot change createdAt");
    this.events.set(parsed.id, copy(parsed));
  }
  async softDelete(householdId: string, id: string, deletedAt: string): Promise<void> {
    const event = await this.get(householdId, id); if (!event) throw new Error(`Event ${id} does not exist`);
    this.events.set(id, copy(CareEventSchema.parse({ ...event, deletedAt, updatedAt: deletedAt })));
  }
  async restore(householdId: string, id: string): Promise<void> {
    const event = await this.get(householdId, id); if (!event) throw new Error(`Event ${id} does not exist`);
    const restoredAt = UtcInstantSchema.parse(this.currentInstant());
    this.events.set(id, copy(CareEventSchema.parse({ ...event, deletedAt: null, updatedAt: restoredAt })));
  }
  async purgeAll(householdId: string): Promise<void> { for (const [id, event] of this.events) if (event.householdId === householdId) this.events.delete(id); }
  async export(householdId: string): Promise<CareEvent[]> { return this.list({ householdId, includeDeleted: true }); }
  async import(householdId: string, events: CareEvent[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0; let skipped = 0;
    for (const event of events) {
      const result = CareEventSchema.safeParse(event);
      if (!result.success || result.data.householdId !== householdId || result.data.provenance !== this.mode || this.events.has(result.data.id)) { skipped += 1; continue; }
      this.events.set(result.data.id, copy(result.data)); imported += 1;
    }
    return { imported, skipped };
  }
}