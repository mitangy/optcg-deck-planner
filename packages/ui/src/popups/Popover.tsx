import { Popover, PopoverButton, PopoverGroup, PopoverPanel as HeadlessPopoverPanel, type PopoverPanelProps } from "@headlessui/react";
import "./ui.css";

export { Popover, PopoverButton, PopoverGroup };

/**
 * The panel of a `Popover`. It is anchored to the button and rendered in a portal with floating
 * (not in-flow) positioning, so opening it never moves the trigger or its neighbours. Unlike a
 * `Menu` it holds any controls (checkboxes, steppers, text): clicks inside leave it open and Tab
 * walks through it. Escape (focus returns to the button), outside click and tabbing out of the
 * panel close it. `anchor` takes a placement (`"bottom end"`) or `{ to, gap, padding }`; the panel
 * flips and shifts to stay on screen. Pass `role` and `aria-label` when it is a dialog or region.
 */
export function PopoverPanel({ anchor = "bottom start", className, ...props }: PopoverPanelProps) {
  const extra = typeof className === "string" ? className : "";
  return <HeadlessPopoverPanel anchor={anchor} className={`ui-popover-panel ${extra}`.trim()} {...props} />;
}
