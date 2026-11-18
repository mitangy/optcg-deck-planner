import {
  Listbox,
  ListboxButton as HeadlessListboxButton,
  ListboxOption,
  ListboxOptions as HeadlessListboxOptions,
  type ListboxButtonProps,
  type ListboxOptionsProps,
} from "@headlessui/react";
import type { KeyboardEvent } from "react";
import "./ui.css";

export { Listbox, ListboxOption };

// Headless UI leaves Enter to submit a surrounding form; this also opens on Enter, as a button does, unless it sits in a form.
export function ListboxButton({ onKeyDown, ...props }: ListboxButtonProps) {
  return (
    <HeadlessListboxButton
      {...props}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.key !== "Enter" || e.currentTarget.form) return;
        e.preventDefault();
        e.currentTarget.click();
      }}
    />
  );
}

export function ListboxList({ anchor = "bottom start", className, ...props }: ListboxOptionsProps) {
  const extra = typeof className === "string" ? className : "";
  return <HeadlessListboxOptions anchor={anchor} className={`ui-menu-items ${extra}`.trim()} {...props} />;
}
