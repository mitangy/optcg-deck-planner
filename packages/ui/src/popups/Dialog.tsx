import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useCallback, useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import "./ui.css";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  panelClassName?: string;
  label?: string;
  role?: "dialog" | "alertdialog";
  /** With false only Escape closes, for an editor where a stray click must not throw the work away. */
  closeOnOutsideClick?: boolean;
  panelRef?: Ref<HTMLDivElement>;
  panelProps?: Omit<ComponentPropsWithoutRef<"div">, "className" | "children">;
  transition?: boolean;
  children: ReactNode;
};

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
  transition = false,
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
    <HeadlessDialog open={open} onClose={close} role={role} transition={transition} className={`ui-dialog ${className ?? ""}`.trim()} aria-label={label}>
      <DialogPanel ref={panelRef} transition={transition} className={`ui-dialog-panel ${panelClassName ?? ""}`.trim()} {...panelProps}>
        {children}
      </DialogPanel>
    </HeadlessDialog>
  );
}

export { DialogTitle };
