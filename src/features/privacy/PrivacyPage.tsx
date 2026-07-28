"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, PageHeader } from "@/src/features/shared/ExperiencePrimitives";

type PersistenceState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export function Privacy() {
  const [persistence, setPersistence] = useState<PersistenceState>("idle");

  const requestPersistence = async () => {
    if (!navigator.storage?.persist) {
      setPersistence("unavailable");
      return;
    }
    setPersistence("requesting");
    try {
      const granted = await navigator.storage.persist();
      setPersistence(granted ? "granted" : "denied");
    } catch {
      setPersistence("unavailable");
    }
  };

  const persistenceLabel =
    persistence === "requesting" ? COPY.privacy.storageRequesting :
    persistence === "granted" ? COPY.privacy.storageGranted :
    persistence === "denied" ? COPY.privacy.storageDenied :
    persistence === "unavailable" ? COPY.privacy.storageUnavailable :
    COPY.privacy.storageAction;

  return (
    <>
      <PageHeader eyebrow={COPY.privacy.eyebrow} title={COPY.privacy.title} intro={COPY.privacy.intro} />
      <div className="privacy-grid">
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="shield" /></span>
          <div><h2>{COPY.privacy.storageTitle}</h2><p>{COPY.privacy.storageBody}</p><button className="button button--soft" type="button" onClick={requestPersistence} disabled={persistence !== "idle"}>{persistenceLabel}</button></div>
        </section>
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="download" /></span>
          <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.backupTitle}</h2><p>{COPY.privacy.backupBody}</p><div className="button-cluster"><button type="button" disabled>{COPY.privacy.exportJson}</button><button type="button" disabled>{COPY.privacy.exportCsv}</button><button type="button" disabled>{COPY.privacy.exportMetrics}</button></div></div>
        </section>
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="arrow" /></span>
          <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.importTitle}</h2><p>{COPY.privacy.importBody}</p><label className="file-button file-button--disabled" aria-disabled="true"><input type="file" accept=".json" disabled />{COPY.privacy.chooseFile}</label></div>
        </section>
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="handoff" /></span><div><h2>{COPY.privacy.sharingTitle}</h2><p>{COPY.privacy.sharingBody}</p></div></section>
      </div>
      <section className="danger-zone">
        <span><Icon name="trash" /></span>
        <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.deleteTitle}</h2><p>{COPY.privacy.deleteBody}</p><button className="button button--danger-ghost" type="button" disabled>{COPY.privacy.deleteAction}</button></div>
      </section>
      <p className="provenance"><Icon name="info" />{COPY.privacy.provenance}</p>
    </>
  );
}
