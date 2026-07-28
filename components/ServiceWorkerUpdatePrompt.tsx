"use client";

import { useId, useState } from "react";
import { COPY } from "@/src/copy";
import styles from "./ServiceWorkerUpdatePrompt.module.css";

type ServiceWorkerUpdatePromptProps = {
  applyUpdate: () => Promise<void>;
  onApplied: () => void;
  onDismiss: () => void;
};

export function ServiceWorkerUpdatePrompt({ applyUpdate, onApplied, onDismiss }: ServiceWorkerUpdatePromptProps) {
  const titleId = useId();
  const descriptionId = useId();
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
      setError(COPY.pwa.updateError);
    }
  };

  return (
    <aside
      className={styles.prompt}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className={styles.copy}>
        <h2 id={titleId}>{COPY.pwa.updateTitle}</h2>
        <p id={descriptionId}>{COPY.pwa.updateDescription}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button className="button button--primary" type="button" onClick={() => void activate()} disabled={applying} aria-busy={applying}>
          {applying ? COPY.pwa.updateApplying : COPY.pwa.updateApply}
        </button>
        <button className="button button--ghost" type="button" onClick={onDismiss} disabled={applying}>{COPY.pwa.updateLater}</button>
      </div>
    </aside>
  );
}
