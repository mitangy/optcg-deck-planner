import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useCallback, useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import "./ui.css";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Classes of the full-screen backdrop. It is also the `role="dialog"` element. */
  className?: string;
  /** Classes of the panel. A click outside the panel closes the dialog. */
  panelClassName?: string;
  /** Accessible name, when the panel has no `DialogTitle`. */
  label?: string;
  /** `alertdialog` for a notice that needs an answer. Default `dialog`. */
  role?: "dialog" | "alertdialog";
  /**
   * Whether a click or tap outside the panel calls `onClose` (default true). With `false`
   * only Escape does, for an editor where a stray click must not throw the work away.
   */
  closeOnOutsideClick?: boolean;
  /** Ref of the panel element (a swipe-to-dismiss sheet moves it). */
  panelRef?: Ref<HTMLDivElement>;
  /** Extra attributes and handlers for the panel element. */
  panelProps?: Omit<ComponentPropsWithoutRef<"div">, "className" | "children">;
  children: ReactNode;
};

/**
 * A modal over the page. Headless UI gives it a focus trap (focus starts inside
 * and returns to the trigger on close), Escape and outside-click close, a
 * portal to the end of `<body>`, and a page scroll lock. The look comes from
 * `className` / `panelClassName`; ui.css only places the backdrop.
 */
export function Dialog({
  open,
  onClose,
  className,
  panelClassName,
  label,
  role,
  closeOnOutsideClick = true,
  panelRef,
  panelProps,
  children,
}: DialogProps) {
  // Headless UI calls onClose for Escape and for an outside click alike. When only Escape may close,
  // note the key in the capture phase (before Headless UI's own window listener) and drop other calls.
  const escapeJustPressed = useRef(false);
  useEffect(() => {
    if (closeOnOutsideClick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      escapeJustPressed.current = true;
      setTimeout(() => {
        escapeJustPressed.current = false;
      }, 0);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeOnOutsideClick]);
  const close = useCallback(() => {
    if (closeOnOutsideClick || escapeJustPressed.current) onClose();
  }, [closeOnOutsideClick, onClose]);

  return (
    <HeadlessDialog open={open} onClose={close} role={role} className={`ui-dialog ${className ?? ""}`.trim()} aria-label={label}>
      <DialogPanel ref={panelRef} className={`ui-dialog-panel ${panelClassName ?? ""}`.trim()} {...panelProps}>
        {children}
      </DialogPanel>
    </HeadlessDialog>
  );
}

/** Names the dialog (`aria-labelledby`); use it for the visible heading. */
export { DialogTitle };
