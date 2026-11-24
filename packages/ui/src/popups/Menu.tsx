import {
  Menu,
  MenuButton,
  MenuItem as HeadlessMenuItem,
  MenuItems,
  type MenuItemProps,
  type MenuItemsProps,
} from "@headlessui/react";
import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import { cx } from "../classNames";
import "./ui.css";

export { Menu, MenuButton };

export type MenuItemWithKeepOpen = MenuItemProps & {
  keepOpen?: boolean;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
};

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

export function MenuList({ anchor = "bottom start", className, onKeyDownCapture, ...props }: MenuItemsProps) {
  const extra = typeof className === "string" ? className : "";
  const lastChar = useRef(0);
  return (
    <MenuItems
      anchor={anchor}
      className={cx("ui-menu-items", extra)}
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
