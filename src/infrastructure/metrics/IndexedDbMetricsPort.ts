import type { MetricEntry, MetricName, MetricsPort } from "@/src/ports/MetricsPort";
import { registerLocalConnectionCloser } from "@/src/infrastructure/storage/connectionRegistry";
import { databaseName, type DataRealm } from "@/src/infrastructure/storage/names";
const STORE = "entries", VERSION = 1;
const NAMES: ReadonlySet<MetricName> = new Set([
  "onboarding_completed", "event_proposed", "event_confirmed_unchanged", "event_confirmed_edited",
  "parser_refused", "capture_typed", "capture_voice", "capture_manual", "handoff_generated",
  "handoff_qr_displayed", "handoff_opened", "privacy_center_opened", "export_created", "delete_all_completed",
]);
type Stored = MetricEntry & { id?: number };
export function metricsDatabaseName(realm: DataRealm): string { return databaseName("metrics", realm); }
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{ request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error??new Error("IndexedDB request failed")); }); }
function complete(transaction: IDBTransaction): Promise<void> { return new Promise((resolve,reject)=>{ transaction.oncomplete=()=>resolve(); transaction.onerror=()=>reject(transaction.error??new Error("IndexedDB transaction failed")); transaction.onabort=()=>reject(transaction.error??new Error("IndexedDB transaction aborted")); }); }
function sanitize(entry: MetricEntry): MetricEntry | null {
  if (!NAMES.has(entry.name)) return null;
  if (typeof entry.at !== "string" || Number.isNaN(Date.parse(entry.at))) throw new TypeError("Metric timestamp must be an ISO-compatible string");
  if (entry.durationMs !== undefined && (!Number.isFinite(entry.durationMs) || entry.durationMs < 0)) throw new TypeError("Metric duration must be finite and non-negative");
  return entry.durationMs === undefined ? { name:entry.name, at:entry.at } : { name:entry.name, at:entry.at, durationMs:entry.durationMs };
}
export class IndexedDbMetricsPort implements MetricsPort {
  private pending: Promise<IDBDatabase> | undefined;
  private readonly unregister: () => void;
  constructor(readonly realm: DataRealm, private readonly factory: IDBFactory = globalThis.indexedDB) {
    if (!factory) throw new Error("IndexedDB is unavailable in this environment");
    this.unregister = registerLocalConnectionCloser(this.realm, () => this.close());
  }
  private database(): Promise<IDBDatabase> {
    this.pending ??= new Promise((resolve,reject)=>{
      const request=this.factory.open(metricsDatabaseName(this.realm),VERSION);
      request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains(STORE)){ const store=request.result.createObjectStore(STORE,{keyPath:"id",autoIncrement:true}); store.createIndex("at","at"); store.createIndex("name","name"); } };
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error??new Error("Unable to open metrics ledger")); request.onblocked=()=>reject(new Error("Metrics ledger upgrade was blocked"));
    });
    return this.pending;
  }
  async record(entry: MetricEntry): Promise<void> { const clean=sanitize(entry); if(!clean)return; const db=await this.database(); const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).add(clean); await complete(tx); }
  async list(): Promise<MetricEntry[]> { const db=await this.database(); const tx=db.transaction(STORE,"readonly"); const rows=await result(tx.objectStore(STORE).getAll() as IDBRequest<Stored[]>); await complete(tx); return rows.sort((a,b)=>a.at.localeCompare(b.at)||(a.id??0)-(b.id??0)).flatMap((row)=>{const clean=sanitize(row);return clean?[clean]:[];}); }
  async exportJson(): Promise<string> { return JSON.stringify({schemaVersion:VERSION,realm:this.realm,entries:await this.list()},null,2); }
  async clear(): Promise<void> { const db=await this.database(); const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).clear(); await complete(tx); }
  async close(): Promise<void> { const pending=this.pending; this.pending=undefined; if(pending)(await pending).close(); }
  async dispose(): Promise<void> { await this.close(); this.unregister(); }
}
