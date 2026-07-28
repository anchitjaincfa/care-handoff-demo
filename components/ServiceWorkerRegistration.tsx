"use client";

import { useEffect, useState } from "react";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";
import { monitorServiceWorkerUpdates } from "@/src/infrastructure/pwa/updateLifecycle";

type ApplyUpdate = () => Promise<void>;

export function ServiceWorkerRegistration() {
  const [applyUpdate, setApplyUpdate] = useState<ApplyUpdate | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let stopMonitoring: (() => void) | undefined;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (disposed) return;
      stopMonitoring = monitorServiceWorkerUpdates(registration, (activate) => {
        if (!disposed) setApplyUpdate(() => activate);
      });
    }).catch(() => undefined);

    return () => {
      disposed = true;
      stopMonitoring?.();
    };
  }, []);

  if (!applyUpdate) return null;
  return (
    <ServiceWorkerUpdatePrompt
      applyUpdate={applyUpdate}
      onApplied={() => window.location.reload()}
      onDismiss={() => setApplyUpdate(null)}
    />
  );
}
