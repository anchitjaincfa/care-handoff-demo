import type { CareEvent } from "@/src/domain/types";
export type EventQuery = { householdId: string; babyId?: string; from?: string; to?: string; includeDeleted?: boolean };
export interface EventRepository {
  list(query: EventQuery): Promise<CareEvent[]>;
  get(householdId: string, id: string): Promise<CareEvent | null>;
  append(event: CareEvent): Promise<void>;
  appendBatch(events: CareEvent[]): Promise<void>;
  revise(event: CareEvent): Promise<void>;
  softDelete(householdId: string, id: string, deletedAt: string): Promise<void>;
  restore(householdId: string, id: string): Promise<void>;
  purgeAll(householdId: string): Promise<void>;
  export(householdId: string): Promise<CareEvent[]>;
  import(householdId: string, events: CareEvent[]): Promise<{ imported: number; skipped: number }>;
  isEmpty(): Promise<boolean>;
  restoreSnapshot(householdId: string, events: CareEvent[]): Promise<void>;
  adoptSnapshot(householdId: string, events: CareEvent[]): Promise<void>;
}
