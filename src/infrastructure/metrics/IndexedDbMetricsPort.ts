import type { MetricEntry, MetricName, MetricsPort } from "@/src/ports/MetricsPort";

export const METRICS_DATABASE_NAME = "nuzzlecue-metrics";
const METRICS_STORE_NAME = "entries";
const METRICS_DATABASE_VERSION = 1;

const METRIC_NAMES: ReadonlySet<MetricName> = new Set([
  "onboarding_completed",
  "event_proposed",
  "event_confirmed_unchanged",
  "event_confirmed_edited",
  "parser_refused",
  "capture_typed",
  "capture_voice",
  "capture_manual",
  "handoff_generated",
  "handoff_qr_displayed",
  "handoff_opened",
  "privacy_center_opened",
  "export_created",
  "delete_all_completed",
]);

type StoredMetricEntry = MetricEntry & { id?: number };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function contentFreeEntry(entry: MetricEntry): MetricEntry {
  if (!METRIC_NAMES.has(entry.name)) throw new TypeError(`Unknown metric name: ${String(entry.name)}`);
  if (typeof entry.at !== "string" || Number.isNaN(Date.parse(entry.at))) {
    throw new TypeError("Metric timestamp must be an ISO-compatible string");
  }
  if (entry.durationMs !== undefined && (!Number.isFinite(entry.durationMs) || entry.durationMs < 0)) {
    throw new TypeError("Metric duration must be a finite, non-negative number");
  }
  return entry.durationMs === undefined
    ? { name: entry.name, at: entry.at }
    : { name: entry.name, at: entry.at, durationMs: entry.durationMs };
}

export class IndexedDbMetricsPort implements MetricsPort {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly factory: IDBFactory = globalThis.indexedDB) {
    if (!factory) throw new Error("IndexedDB is unavailable in this environment");
  }

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.factory.open(METRICS_DATABASE_NAME, METRICS_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(METRICS_STORE_NAME)) {
          const store = database.createObjectStore(METRICS_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("at", "at", { unique: false });
          store.createIndex("name", "name", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open metrics ledger"));
      request.onblocked = () => reject(new Error("Metrics ledger upgrade was blocked"));
    });
    return this.databasePromise;
  }

  async record(entry: MetricEntry): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(METRICS_STORE_NAME, "readwrite");
    transaction.objectStore(METRICS_STORE_NAME).add(contentFreeEntry(entry));
    await transactionComplete(transaction);
  }

  async list(): Promise<MetricEntry[]> {
    const database = await this.database();
    const transaction = database.transaction(METRICS_STORE_NAME, "readonly");
    const stored = await requestResult(
      transaction.objectStore(METRICS_STORE_NAME).getAll() as IDBRequest<StoredMetricEntry[]>,
    );
    await transactionComplete(transaction);
    return stored
      .sort((left, right) => left.at.localeCompare(right.at) || (left.id ?? 0) - (right.id ?? 0))
      .map((entry) => contentFreeEntry(entry));
  }

  async exportJson(): Promise<string> {
    return JSON.stringify({
      schemaVersion: METRICS_DATABASE_VERSION,
      entries: await this.list(),
    }, null, 2);
  }

  async clear(): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(METRICS_STORE_NAME, "readwrite");
    transaction.objectStore(METRICS_STORE_NAME).clear();
    await transactionComplete(transaction);
  }
}
