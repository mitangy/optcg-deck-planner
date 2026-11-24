import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogTitle } from "./Dialog";

export type ConfirmOptions = {
  title: string;
  /** Plain text; blank lines start a new paragraph. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger style on the confirm button. Default true: confirms guard destructive actions. */
  danger?: boolean;
};

export type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Cancel holds focus when it opens, so Enter never confirms by accident. Escape and an outside click cancel. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const paragraphs = (message ?? "").split(/\n{2,}/).filter(Boolean);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // A menu that opened this dialog hands focus back to its own button as it closes, which can land after
  // Headless UI's autofocus. Take it back so Cancel always holds focus.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const button = cancelRef.current;
      if (button && !button.closest('[role="alertdialog"]')?.contains(document.activeElement)) button.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <Dialog open={open} onClose={onCancel} role="alertdialog" className="ui-confirm-backdrop" panelClassName="ui-surface ui-confirm">
      <DialogTitle as="h2" className="ui-confirm-title">
        {title}
      </DialogTitle>
      {paragraphs.map((p) => (
        <p key={p} className="ui-confirm-message">
          {p}
        </p>
      ))}
      <div className="ui-confirm-actions">
        <button ref={cancelRef} type="button" className="btn secondary" data-autofocus onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn primary${danger ? " danger" : ""}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * `const { confirm, confirmDialog } = useConfirm();` then `if (await confirm({ title, ... })) doIt();`
 * and render `{confirmDialog}` once. Resolves false on cancel, Escape or an outside click.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);
  const shown = useRef<ConfirmOptions | null>(null);
  if (options) shown.current = options;

  const confirm = useCallback((o: ConfirmOptions) => {
    settle.current?.(false);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
      setOptions(o);
    });
  }, []);
  const finish = (ok: boolean) => {
    settle.current?.(ok);
    settle.current = null;
    setOptions(null);
  };

  // Keep the last options mounted while closing so the text does not blank mid-fade.
  const last = shown.current;
  const confirmDialog = last ? (
    <ConfirmDialog {...last} open={options !== null} onConfirm={() => finish(true)} onCancel={() => finish(false)} />
  ) : null;
  return { confirm, confirmDialog };
}
