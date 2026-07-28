"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { ActionNotice, Badge, ConfirmDialog, PageHeader } from "@/src/features/shared/ExperiencePrimitives";
import type { PrivacyPageProps } from "@/src/features/runtime/contracts";

type PersistenceState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 10 || Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
}

function storageEstimateLabel(estimate: PrivacyPageProps["storageEstimate"]): string {
  const usage = estimate.usageBytes;
  const quota = estimate.quotaBytes;
  if (usage !== undefined && quota !== undefined) return `${COPY.live.storageEstimatePrefix} ${formatBytes(usage)} ${COPY.live.storageEstimateOf} ${formatBytes(quota)} ${COPY.live.storageEstimateAvailable}`;
  if (usage !== undefined) return `${COPY.live.storageEstimatePrefix} ${formatBytes(usage)} ${COPY.live.storageEstimateUsageOnly}`;
  if (quota !== undefined) return `${COPY.live.storageEstimatePrefix} ${formatBytes(quota)} ${COPY.live.storageEstimateQuotaOnly}`;
  return COPY.live.storageEstimateUnavailable;
}

export function PrivacyView(props: PrivacyPageProps) {
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeWord, setWipeWord] = useState("");
  const [wipeTrigger, setWipeTrigger] = useState<HTMLElement | null>(null);
  const [importTrigger, setImportTrigger] = useState<HTMLElement | null>(null);
  const importReview = props.importState.status === "review" ? props.importState : null;
  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    try { void props.onChooseImport({ name: file.name, text: await file.text() }); }
    catch { void props.onChooseImport({ name: file.name, text: "" }); }
  };
  const wipe = () => {
    if (wipeWord !== COPY.privacy.confirmWord) return;
    void props.onWipe(wipeWord);
    setWipeOpen(false);
    setWipeWord("");
  };
  const storageLabel = props.storage === "requesting" ? COPY.privacy.storageRequesting : props.storage === "granted" ? COPY.privacy.storageGranted : props.storage === "denied" ? COPY.privacy.storageDenied : props.storage === "unavailable" ? COPY.privacy.storageUnavailable : COPY.privacy.storageAction;
  return (
    <>
      <PageHeader eyebrow={COPY.privacy.eyebrow} title={COPY.privacy.title} intro={COPY.privacy.intro} />
      <div className="privacy-grid">
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="shield" /></span><div><h2>{COPY.privacy.storageTitle}</h2><p>{COPY.live.storageBody}</p><p className="panel-note">{storageEstimateLabel(props.storageEstimate)}</p><button className="button button--soft" type="button" onClick={() => void props.onRequestPersistence()} disabled={props.storage === "requesting" || props.storage === "granted"}>{storageLabel}</button></div></section>
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="download" /></span><div><h2>{COPY.privacy.backupTitle}</h2><p>{COPY.live.backupBody}</p><div className="button-cluster"><button type="button" onClick={() => void props.onExport("json")} disabled={props.exportPhase === "pending"}>{COPY.live.exportJson}</button><button type="button" onClick={() => void props.onExport("csv")} disabled={props.exportPhase === "pending"}>{COPY.live.exportCsv}</button><button type="button" onClick={() => void props.onExport("metrics-json")} disabled={props.exportPhase === "pending"}>{COPY.live.exportMetrics}</button></div><ActionNotice phase={props.exportPhase} /></div></section>
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="arrow" /></span><div><h2>{COPY.privacy.importTitle}</h2><p>{COPY.live.importBody}</p><label className="file-button"><input type="file" accept=".json,application/json" onChange={(event) => { setImportTrigger(event.currentTarget); void chooseFile(event.target.files?.[0]); }} disabled={props.importState.status === "reading" || props.importState.status === "importing"} />{COPY.live.chooseBackup}</label></div></section>
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="handoff" /></span><div><h2>{COPY.privacy.sharingTitle}</h2><p>{COPY.privacy.sharingBody}</p></div></section>
      </div>
      {props.importState.status === "reading" && <p className="panel-note" role="status"><Icon name="clock" />{COPY.live.importReading} {props.importState.fileName}</p>}
      <ConfirmDialog
        open={importReview !== null}
        trigger={importTrigger}
        title={COPY.live.importPreviewTitle}
        body={importReview ? `${importReview.fileName}${COPY.live.separator}${importReview.eventCount}` : ""}
        confirmLabel={COPY.live.importConfirm}
        onCancel={() => void props.onCancelImport()}
        onConfirm={() => void props.onConfirmImport()}
      >
        {importReview && importReview.warnings.length > 0 && <div><h3>{COPY.live.importWarnings}</h3><ul>{importReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      </ConfirmDialog>
      {props.importState.status === "importing" && <p className="panel-note" role="status"><Icon name="clock" />{COPY.live.working}</p>}
      {props.importState.status === "success" && <p className="panel-note" role="status"><Icon name="check" />{COPY.live.importSuccess} {props.importState.importedCount}</p>}
      {props.importState.status === "error" && <p className="field-error" role="alert">{props.importState.reason}</p>}
      <section className="danger-zone"><span><Icon name="trash" /></span><div><h2>{COPY.privacy.deleteTitle}</h2><p>{COPY.live.deleteBody}</p><button className="button button--danger-ghost" type="button" onClick={(event) => { setWipeTrigger(event.currentTarget); setWipeOpen(true); }} disabled={props.wipePhase === "pending"}>{COPY.live.deleteForever}</button><ActionNotice phase={props.wipePhase} /></div></section>
      <ConfirmDialog open={wipeOpen} trigger={wipeTrigger} title={COPY.live.deleteTitle} body={COPY.live.deleteBody} confirmLabel={COPY.live.deleteForever} danger onCancel={() => { setWipeOpen(false); setWipeWord(""); }} onConfirm={wipe}><label><span>{COPY.live.deleteInstruction}</span><input value={wipeWord} onChange={(event) => setWipeWord(event.target.value)} autoComplete="off" aria-invalid={wipeWord.length > 0 && wipeWord !== COPY.privacy.confirmWord} /></label></ConfirmDialog>
      <p className="provenance"><Icon name="info" />{COPY.privacy.provenance}</p>
    </>
  );
}

export function PrivacyPreview() {
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

export const Privacy = PrivacyPreview;
