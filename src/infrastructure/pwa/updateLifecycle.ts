export type ServiceWorkerUpdatePrompt = (applyUpdate: () => Promise<void>) => void | Promise<void>;

function controllerChange(container: ServiceWorkerContainer, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const changed = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      container.removeEventListener("controllerchange", changed);
      reject(new Error("Service-worker update timed out"));
    }, timeoutMs);
    container.addEventListener("controllerchange", changed, { once: true });
  });
}

export async function applyWaitingServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer = navigator.serviceWorker,
  timeoutMs = 10_000,
): Promise<void> {
  if (!registration.waiting) throw new Error("No service-worker update is waiting");
  const changed = controllerChange(container, timeoutMs);
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  await changed;
}

export function monitorServiceWorkerUpdates(
  registration: ServiceWorkerRegistration,
  prompt: ServiceWorkerUpdatePrompt,
  container: ServiceWorkerContainer = navigator.serviceWorker,
): () => void {
  let active = false;
  let stopped = false;
  let offeredWorker: ServiceWorker | null = null;
  const stateListeners = new Map<ServiceWorker, () => void>();

  const offer = async () => {
    const waiting = registration.waiting;
    if (stopped || !container.controller || !waiting || active || offeredWorker === waiting) return;
    active = true;
    offeredWorker = waiting;
    try {
      await prompt(() => applyWaitingServiceWorkerUpdate(registration, container));
    } catch {
      offeredWorker = null;
    } finally {
      active = false;
    }
  };

  const found = () => {
    const installing = registration.installing;
    if (!installing || stateListeners.has(installing)) return;
    const stateChanged = () => {
      if (installing.state !== "installed") return;
      installing.removeEventListener("statechange", stateChanged);
      stateListeners.delete(installing);
      void offer();
    };
    stateListeners.set(installing, stateChanged);
    installing.addEventListener("statechange", stateChanged);
  };

  registration.addEventListener("updatefound", found);
  void offer();
  return () => {
    stopped = true;
    registration.removeEventListener("updatefound", found);
    for (const [worker, listener] of stateListeners) worker.removeEventListener("statechange", listener);
    stateListeners.clear();
  };
}
