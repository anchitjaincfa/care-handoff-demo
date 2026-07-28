"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { ActionPhase } from "@/src/features/runtime/contracts";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";

export type BadgeTone = "live" | "demo" | "preview" | "planned" | "excluded";
export type Toast = string | null;

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}><span className="badge__dot" aria-hidden="true" />{children}</span>;
}

export function ConfidenceChip({ attention = false }: { attention?: boolean }) {
  return <span className={attention ? "confidence-chip confidence-chip--attention" : "confidence-chip"}><Icon name={attention ? "info" : "check"} />{attention ? COPY.capture.uncertain : COPY.capture.confident}</span>;
}

export function PreviewDisclosure({ children }: { children: ReactNode }) {
  return <aside className="preview-disclosure"><Badge tone="preview">{COPY.global.preview}</Badge><p>{children}</p></aside>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} href="/" aria-label={COPY.nav.home}>
      <span className="brand__mark" aria-hidden="true"><span /><span /></span>
      <span className="brand__name">{COPY.global.product}</span>
    </Link>
  );
}

export function ToastMessage({ message, onClose }: { message: Toast; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="toast__check"><Icon name="check" /></span>
      <span>{message}</span>
      <button className="icon-button" type="button" onClick={onClose} aria-label={COPY.global.close}><span aria-hidden="true">{COPY.global.closeGlyph}</span></button>
    </div>
  );
}

export function PageHeader({ eyebrow, title, intro, actions }: { eyebrow: string; title: string; intro?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}


export function ActionNotice({ phase, success, error }: { phase: ActionPhase; success?: string; error?: string }) {
  if (phase === "idle") return null;
  const message = phase === "pending" ? COPY.live.working : phase === "success" ? (success ?? COPY.live.saved) : (error ?? COPY.live.actionError);
  return <p className={phase === "error" ? "field-error" : "panel-note"} role={phase === "error" ? "alert" : "status"} aria-live="polite"><Icon name={phase === "error" ? "info" : "check"} />{message}</p>;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  confirmDisabled = false,
  trigger,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  trigger?: HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    const restoreTarget = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreTarget?.focus();
    };
  }, [open, trigger]);

  if (!open) return null;
  return (
    <div ref={dialogRef} className="warning-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1}>
      <h2 id={titleId}>{title}</h2>
      <p id={bodyId}>{body}</p>
      {children}
      <div className="button-row">
        <button ref={cancelRef} className="button button--ghost" type="button" onClick={onCancel}>{COPY.global.cancel}</button>
        <button className={danger ? "button button--danger-ghost" : "button button--primary"} type="button" onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
      </div>
    </div>
  );
}
