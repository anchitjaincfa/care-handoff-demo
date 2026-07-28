import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import type { EventQuery, EventRepository } from "@/src/ports/EventRepository";

function copy(event: CareEvent): CareEvent {
  return structuredClone(event);
}

function matches(event: CareEvent, query: EventQuery): boolean {
  return event.householdId === query.householdId
    && (!query.babyId || event.babyId === query.babyId)
    && (!query.from || event.startedAt >= query.from)
    && (!query.to || event.startedAt <= query.to)
    && (query.includeDeleted || event.deletedAt === null);
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, CareEvent>();

  async list(query: EventQuery): Promise<CareEvent[]> {
    return [...this.events.values()].filter((event) => matches(event, query))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)).map(copy);
  }

  async get(householdId: string, id: string): Promise<CareEvent | null> {
    const event = this.events.get(id);
    return event?.householdId === householdId ? copy(event) : null;
  }

  async append(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event);
    if (this.events.has(parsed.id)) throw new Error(`Event ${parsed.id} already exists`);
    this.events.set(parsed.id, copy(parsed));
  }

  async revise(event: CareEvent): Promise<void> {
    const parsed = CareEventSchema.parse(event);
    const current = this.events.get(parsed.id);
    if (!current || current.householdId !== parsed.householdId) throw new Error(`Event ${parsed.id} does not exist`);
    if (current.createdAt !== parsed.createdAt) throw new Error("Revision cannot change createdAt");
    this.events.set(parsed.id, copy(parsed));
  }

  async softDelete(householdId: string, id: string, deletedAt: string): Promise<void> {
    const event = await this.get(householdId, id);
    if (!event) throw new Error(`Event ${id} does not exist`);
    const updated = CareEventSchema.parse({ ...event, deletedAt, updatedAt: deletedAt });
    this.events.set(id, copy(updated));
  }

  async restore(householdId: string, id: string): Promise<void> {
    const event = await this.get(householdId, id);
    if (!event) throw new Error(`Event ${id} does not exist`);
    this.events.set(id, copy(CareEventSchema.parse({ ...event, deletedAt: null })));
  }

  async purgeAll(householdId: string): Promise<void> {
    for (const [id, event] of this.events) if (event.householdId === householdId) this.events.delete(id);
  }

  async export(householdId: string): Promise<CareEvent[]> {
    return this.list({ householdId, includeDeleted: true });
  }

  async import(householdId: string, events: CareEvent[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const event of events) {
      const result = CareEventSchema.safeParse(event);
      if (!result.success || result.data.householdId !== householdId || this.events.has(result.data.id)) { skipped += 1; continue; }
      this.events.set(result.data.id, copy(result.data));
      imported += 1;
    }
    return { imported, skipped };
  }
}