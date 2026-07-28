"use client";

import { useEffect, useState } from "react";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";
import { monitorServiceWorkerUpdates, type ServiceWorkerUpdateOffer } from "@/src/infrastructure/pwa/updateLifecycle";

export function ServiceWorkerRegistration() {
  const [updateOffer, setUpdateOffer] = useState<ServiceWorkerUpdateOffer | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let stopMonitoring: (() => void) | undefined;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (disposed) return;
      stopMonitoring = monitorServiceWorkerUpdates(registration, (offer) => {
        if (!disposed) setUpdateOffer(offer);
      });
    }).catch(() => undefined);

    return () => {
      disposed = true;
      stopMonitoring?.();
    };
  }, []);

  if (!updateOffer) return null;
  return (
    <ServiceWorkerUpdatePrompt
      applyUpdate={updateOffer.applyUpdate}
      onApplied={() => window.location.reload()}
      onDismiss={() => {
        updateOffer.deferUpdate();
        setUpdateOffer(null);
      }}
    />
  );
}
