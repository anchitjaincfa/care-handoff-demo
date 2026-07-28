export type LocalConnectionCloser = () => void | Promise<void>;
export type ClosableLocalConnection = { close(): void | Promise<void> };
const connectionClosers = new Set<LocalConnectionCloser>();
export function registerLocalConnectionCloser(closer: LocalConnectionCloser): () => void {
  connectionClosers.add(closer);
  return () => connectionClosers.delete(closer);
}
export function registerClosableLocalConnection(connection: ClosableLocalConnection): () => void {
  return registerLocalConnectionCloser(() => connection.close());
}
export async function closeRegisteredLocalConnections(): Promise<void> {
  const results = await Promise.allSettled([...connectionClosers].map((close) => close()));
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, "Unable to close all local database connections");
}
