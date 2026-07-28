"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
