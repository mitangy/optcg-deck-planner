import { Label, type ListboxOptionsProps } from "@headlessui/react";
import type { ReactNode } from "react";
import { Listbox, ListboxButton, ListboxList, ListboxOption } from "./Listbox";

export type SelectOption<T extends string | number> = {
  value: T;
  /** The row in the open list. */
  label: ReactNode;
  /** A smaller second line under the label. */
  sub?: ReactNode;
  disabled?: boolean;
  /** What the closed button shows when `label` is rich or long. Defaults to `label`. */
  buttonLabel?: ReactNode;
};

export type SelectProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  "aria-label"?: string;
  /** A visible label. It wraps the select in a column (`className` then goes on that wrapper). */
  label?: ReactNode;
  /** On the button, so a `<label htmlFor>` keeps working. */
  id?: string;
  disabled?: boolean;
  name?: string;
  /** On the button, or on the wrapper when `label` is given. */
  className?: string;
  buttonClassName?: string;
  listClassName?: string;
  anchor?: ListboxOptionsProps["anchor"];
  title?: string;
};

/**
 * A styled single choice, the replacement for a native `<select>` (whose open list the browser draws in its
 * own colours and ignores the theme). It is the shared Listbox: a button showing the chosen label, and an
 * opaque, themed list in a portal under it, so opening never moves the trigger or its neighbours. Values
 * keep their type (a numeric option calls `onChange` with a number). Style it with the `ui-select-*` classes
 * and the `--ui-field-*` / `--ui-accent` / `--ui-selected` tokens.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  label,
  id,
  disabled,
  name,
  className,
  buttonClassName,
  listClassName,
  anchor = { to: "bottom start", gap: 4, padding: 8 },
  title,
}: SelectProps<T>) {
  const picked = options.find((o) => o.value === value);
  const cls = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");
  const body = (
    <>
      <ListboxButton
        id={id}
        type="button"
        title={title}
        aria-label={label ? undefined : ariaLabel}
        className={cls("ui-select-button", label ? undefined : className, buttonClassName)}
      >
        <span className="ui-select-value">{picked ? (picked.buttonLabel ?? picked.label) : null}</span>
        <span className="ui-select-chevron" aria-hidden>
          ▾
        </span>
      </ListboxButton>
      <ListboxList anchor={anchor} className={cls("ui-select-list", listClassName)}>
        {options.map((o) => (
          <ListboxOption key={o.value} value={o.value} disabled={o.disabled} className="ui-select-option">
            {({ selected }) => (
              <>
                <span className="ui-select-text">
                  <span className="ui-select-label">{o.label}</span>
                  {o.sub != null ? <span className="ui-select-sub">{o.sub}</span> : null}
                </span>
                <span className="ui-select-check" aria-hidden>
                  {selected ? "✓" : ""}
                </span>
              </>
            )}
          </ListboxOption>
        ))}
      </ListboxList>
    </>
  );
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled} name={name}>
      {label ? (
        <div className={cls("ui-select", className)}>
          <Label className="ui-select-field-label">{label}</Label>
          {body}
        </div>
      ) : (
        body
      )}
    </Listbox>
  );
}
