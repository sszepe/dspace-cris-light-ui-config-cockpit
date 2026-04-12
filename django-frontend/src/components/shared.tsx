import React, { useEffect, useRef } from "react";

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ white = false }: { white?: boolean }) {
  return (
    <span
      className={white ? "spinner spinner-white" : "spinner"}
      aria-label="Loading"
    />
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────

type AlertType = "success" | "error" | "info" | "warn";

export function Alert({
  type,
  children,
  onDismiss,
}: {
  type: AlertType;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const icon: Record<AlertType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warn: "⚠",
  };
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{icon[type]}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            opacity: 0.6,
            flexShrink: 0,
          }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── useNotice ─────────────────────────────────────────────────────────────────

export type Notice = { type: AlertType; msg: string } | null;

/** Auto-clears a notice after `ms` milliseconds (default 4 000). */
export function useNotice(ms = 4000) {
  const [notice, setNotice] = React.useState<Notice>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function notify(type: AlertType, msg: string) {
    clearTimeout(timer.current);
    setNotice({ type, msg });
    timer.current = setTimeout(() => setNotice(null), ms);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return { notice, notify, clearNotice: () => setNotice(null) };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={wide ? { maxWidth: 680 } : undefined}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="modal-actions">{children}</div>;
}

// ── FormGroup ─────────────────────────────────────────────────────────────────

export function FormGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

// ── ReadonlyBanner ────────────────────────────────────────────────────────────

export function ReadonlyBanner({ msg }: { msg?: string }) {
  return (
    <div className="readonly-banner">
      🔒{" "}
      {msg ??
        "Read-only — populated by the import_plain_config management command. Edit in DSpace XML and re-import."}
    </div>
  );
}

// ── LoadingBlock ──────────────────────────────────────────────────────────────

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner /> {label}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ msg }: { msg: string }) {
  return <div className="empty-state">{msg}</div>;
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="page-title">{title}</div>
        {desc && <div className="page-desc">{desc}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ── Chip helpers ──────────────────────────────────────────────────────────────

export function EnabledChip({ enabled }: { enabled: boolean }) {
  return (
    <span className={`chip ${enabled ? "chip-green" : "chip-gray"}`}>
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}
