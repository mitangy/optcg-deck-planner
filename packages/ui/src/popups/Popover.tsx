import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverPanel as HeadlessPopoverPanel,
  type PopoverPanelProps,
} from "@headlessui/react";
import "./ui.css";

export { Popover, PopoverBackdrop, PopoverButton, PopoverGroup };

export function PopoverPanel({ anchor = "bottom start", className, ...props }: PopoverPanelProps) {
  const extra = typeof className === "string" ? className : "";
  return <HeadlessPopoverPanel anchor={anchor} className={`ui-popover-panel ${extra}`.trim()} {...props} />;
}
