import { Menu, MenuButton, MenuItem, MenuItems, type MenuItemsProps } from "@headlessui/react";
import "./ui.css";

export { Menu, MenuButton, MenuItem };

/**
 * The list of a `Menu`. It is anchored to the button and rendered in a portal
 * with floating (not in-flow) positioning, so opening it never moves the
 * trigger or its neighbours. Arrow keys, Home / End, type-ahead, Escape and
 * outside click come from Headless UI.
 */
export function MenuList({ anchor = "bottom start", className, ...props }: MenuItemsProps) {
  const extra = typeof className === "string" ? className : "";
  return <MenuItems anchor={anchor} className={`ui-menu-items ${extra}`.trim()} {...props} />;
}
