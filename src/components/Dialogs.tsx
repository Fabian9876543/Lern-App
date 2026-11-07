import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Modal from "./Modal";

/**
 * Bestätigungs- und Eingabedialoge innerhalb der Seite. Ersetzt confirm()/prompt(),
 * die in claude.ai blockiert sind.
 */

type DialogRequest =
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: "prompt";
      title: string;
      label: string;
      initial: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    };

let current: DialogRequest | null = null;
const listeners = new Set<() => void>();

function set(next: DialogRequest | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function confirmDialog(
  message: string,
  opts: { title?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    current?.kind === "confirm" ? current.resolve(false) : current?.resolve(null);
    set({
      kind: "confirm",
      title: opts.title ?? "Bist du sicher?",
      message,
      confirmLabel: opts.confirmLabel ?? "OK",
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

export function promptDialog(
  title: string,
  opts: { label?: string; initial?: string; confirmLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    current?.kind === "confirm" ? current.resolve(false) : current?.resolve(null);
    set({
      kind: "prompt",
      title,
      label: opts.label ?? "",
      initial: opts.initial ?? "",
      confirmLabel: opts.confirmLabel ?? "Speichern",
      resolve,
    });
  });
}

export function DialogHost() {
  const request = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  if (!request) return null;
  return request.kind === "confirm" ? <ConfirmView request={request} /> : <PromptView request={request} />;
}

function ConfirmView({ request }: { request: Extract<DialogRequest, { kind: "confirm" }> }) {
  const close = (ok: boolean) => {
    set(null);
    request.resolve(ok);
  };
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => okRef.current?.focus(), []);
  return (
    <Modal
      title={request.title}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(false)}>
            Abbrechen
          </button>
          <button
            ref={okRef}
            className={`btn ${request.danger ? "btn-danger-solid" : "btn-primary"}`}
            onClick={() => close(true)}
          >
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <p>{request.message}</p>
    </Modal>
  );
}

function PromptView({ request }: { request: Extract<DialogRequest, { kind: "prompt" }> }) {
  const [value, setValue] = useState(request.initial);
  const close = (v: string | null) => {
    set(null);
    request.resolve(v);
  };
  return (
    <Modal
      title={request.title}
      onClose={() => close(null)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(null)}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={!value.trim()} onClick={() => close(value.trim())}>
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) close(value.trim());
        }}
      >
        <label className="field">
          {request.label && <span>{request.label}</span>}
          <input
            id="dialog-prompt-input"
            className="input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </form>
    </Modal>
  );
}
