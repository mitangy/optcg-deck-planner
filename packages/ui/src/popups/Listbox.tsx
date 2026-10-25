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

/**
 * The button of a `Listbox`. Headless UI opens it with Space and the arrow keys and leaves Enter to submit
 * a surrounding form, like a native `<select>`; this one also opens on Enter, as a button does, unless it
 * sits in a form.
 */
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

/**
 * The options of a `Listbox`: a single choice from a list. It is anchored to the button and rendered
 * in a portal with floating positioning, so opening it never moves the trigger or its neighbours.
 * Arrow keys, Home / End, type-ahead, Enter / Space (pick and close), Escape (focus returns to the
 * button) and outside click come from Headless UI. `anchor` takes a placement or `{ to, gap, padding }`.
 * The active row shows `[data-focus]` and the chosen one `[data-selected]`.
 */
export function ListboxList({ anchor = "bottom start", className, ...props }: ListboxOptionsProps) {
  const extra = typeof className === "string" ? className : "";
  return <HeadlessListboxOptions anchor={anchor} className={`ui-menu-items ${extra}`.trim()} {...props} />;
}
