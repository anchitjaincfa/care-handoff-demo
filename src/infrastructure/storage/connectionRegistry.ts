import type { DataRealm } from "@/src/infrastructure/storage/names";

export type LocalConnectionCloser = () => void | Promise<void>;
export type ClosableLocalConnection = { close(): void | Promise<void> };
const connectionClosers = new Map<DataRealm, Set<LocalConnectionCloser>>();

export function registerLocalConnectionCloser(realm: DataRealm, closer: LocalConnectionCloser): () => void {
  const closers = connectionClosers.get(realm) ?? new Set<LocalConnectionCloser>();
  closers.add(closer);
  connectionClosers.set(realm, closers);
  return () => {
    closers.delete(closer);
    if (closers.size === 0) connectionClosers.delete(realm);
  };
}

export function registerClosableLocalConnection(realm: DataRealm, connection: ClosableLocalConnection): () => void {
  return registerLocalConnectionCloser(realm, () => connection.close());
}

export async function closeRegisteredLocalConnections(realm?: DataRealm): Promise<void> {
  const closers = realm === undefined
    ? [...connectionClosers.values()].flatMap((entries) => [...entries])
    : [...(connectionClosers.get(realm) ?? [])];
  const results = await Promise.allSettled(closers.map((close) => close()));
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, realm === undefined
    ? "Unable to close all local database connections"
    : "Unable to close " + realm + " local database connections");
}
