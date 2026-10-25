import {
  Menu,
  MenuButton,
  MenuItem as HeadlessMenuItem,
  MenuItems,
  type MenuItemProps,
  type MenuItemsProps,
} from "@headlessui/react";
import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import "./ui.css";

export { Menu, MenuButton };

export type MenuItemWithKeepOpen = MenuItemProps & {
  /**
   * The item does not close the menu when it is picked (a two-step Concede, a "Copied" flash). It
   * must close the menu itself when it is done, with the `close` of the `Menu` render prop.
   */
  keepOpen?: boolean;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
};

/**
 * An item of a `Menu`: Headless UI's `MenuItem`, plus `keepOpen`. A click, Enter or Space picks
 * the item and closes the menu unless `keepOpen` is set.
 */
export function MenuItem({ keepOpen = false, onClick, ...props }: MenuItemWithKeepOpen) {
  // Headless UI skips its own "close on click" when an earlier handler prevents the default.
  const extra = {
    "data-keep-open": keepOpen ? "" : undefined,
    onClick: keepOpen
      ? (e: MouseEvent<HTMLElement>) => {
          onClick?.(e);
          e.preventDefault();
        }
      : onClick,
  };
  return <HeadlessMenuItem {...props} {...(extra as object)} />;
}

/** Headless UI clears its type-ahead query 350ms after the last character. */
const TYPE_AHEAD_MS = 350;

/**
 * The list of a `Menu`. It is anchored to the button and rendered in a portal
 * with floating (not in-flow) positioning, so opening it never moves the
 * trigger or its neighbours. Arrow keys, Home / End, type-ahead, Escape and
 * outside click come from Headless UI. `anchor` takes a placement
 * (`"bottom end"`) or `{ to, gap, padding }`; the list flips and shifts to stay on screen.
 */
export function MenuList({ anchor = "bottom start", className, onKeyDownCapture, ...props }: MenuItemsProps) {
  const extra = typeof className === "string" ? className : "";
  const lastChar = useRef(0);
  return (
    <MenuItems
      anchor={anchor}
      className={`ui-menu-items ${extra}`.trim()}
      onKeyDownCapture={(e: KeyboardEvent<HTMLDivElement>) => {
        onKeyDownCapture?.(e);
        if (e.defaultPrevented) return;
        if (e.key.length === 1 && e.key !== " ") lastChar.current = Date.now();
        if (e.key !== "Enter" && e.key !== " ") return;
        // Space inside a type-ahead query belongs to the search.
        if (e.key === " " && Date.now() - lastChar.current < TYPE_AHEAD_MS) return;
        const id = e.currentTarget.getAttribute("aria-activedescendant");
        const item = id ? document.getElementById(id) : null;
        // Headless UI closes the menu after Enter / Space whatever the item does; a keepOpen item picks itself instead.
        if (item?.hasAttribute("data-keep-open") && !item.hasAttribute("data-disabled")) {
          e.preventDefault();
          e.stopPropagation();
          item.click();
        }
      }}
      {...props}
    />
  );
}
