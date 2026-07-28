"use client";

import { useState } from "react";
import styles from "./ServiceWorkerUpdatePrompt.module.css";

type ServiceWorkerUpdatePromptProps = {
  applyUpdate: () => Promise<void>;
  onApplied: () => void;
  onDismiss: () => void;
};

export function ServiceWorkerUpdatePrompt({ applyUpdate, onApplied, onDismiss }: ServiceWorkerUpdatePromptProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setApplying(true);
    setError(null);
    try {
      await applyUpdate();
      onApplied();
    } catch {
      setApplying(false);
      setError("The update could not be applied. Your current version is still available; try again when ready.");
    }
  };

  return (
    <aside
      className={styles.prompt}
      role="dialog"
      aria-modal="false"
      aria-labelledby="service-worker-update-title"
      aria-describedby="service-worker-update-description"
    >
      <div className={styles.copy}>
        <h2 id="service-worker-update-title">Update ready</h2>
        <p id="service-worker-update-description">A newer offline version has finished downloading. Nothing changes until you choose Update now.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button className="button button--primary" type="button" onClick={() => void activate()} disabled={applying} aria-busy={applying}>
          {applying ? "Updating…" : "Update now"}
        </button>
        <button className="button button--ghost" type="button" onClick={onDismiss} disabled={applying}>Later</button>
      </div>
    </aside>
  );
}
