import { Label, type ListboxOptionsProps } from "@headlessui/react";
import type { ReactNode } from "react";
import { cx } from "../classNames";
import { Listbox, ListboxButton, ListboxList, ListboxOption } from "./Listbox";

export type SelectOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
  buttonLabel?: ReactNode;
};

export type SelectProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  "aria-label"?: string;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
  buttonClassName?: string;
  listClassName?: string;
  anchor?: ListboxOptionsProps["anchor"];
  title?: string;
};

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
  const body = (
    <>
      <ListboxButton
        id={id}
        type="button"
        title={title}
        aria-label={label ? undefined : ariaLabel}
        className={cx("ui-select-button", label ? undefined : className, buttonClassName)}
      >
        <span className="ui-select-value">{picked ? (picked.buttonLabel ?? picked.label) : null}</span>
        <span className="ui-select-chevron" aria-hidden>
          ▾
        </span>
      </ListboxButton>
      <ListboxList anchor={anchor} className={cx("ui-select-list", listClassName)}>
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
        <div className={cx("ui-select", className)}>
          <Label className="ui-select-field-label">{label}</Label>
          {body}
        </div>
      ) : (
        body
      )}
    </Listbox>
  );
}
