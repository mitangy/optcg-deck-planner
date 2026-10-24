import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from "@headlessui/react";
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
export function Dialog({ open, onClose, className, panelClassName, label, panelRef, panelProps, children }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className={`ui-dialog ${className ?? ""}`.trim()} aria-label={label}>
      <DialogPanel ref={panelRef} className={`ui-dialog-panel ${panelClassName ?? ""}`.trim()} {...panelProps}>
        {children}
      </DialogPanel>
    </HeadlessDialog>
  );
}

/** Names the dialog (`aria-labelledby`); use it for the visible heading. */
export { DialogTitle };
