import {
  Tab as HeadlessTab,
  TabGroup as HeadlessTabGroup,
  TabList as HeadlessTabList,
  TabPanel as HeadlessTabPanel,
  TabPanels as HeadlessTabPanels,
  type TabGroupProps,
  type TabListProps,
  type TabPanelProps,
  type TabPanelsProps,
  type TabProps,
} from "@headlessui/react";
import "./ui.css";

export { HeadlessTab as Tab };
export type { TabGroupProps, TabListProps, TabPanelProps, TabPanelsProps, TabProps };

function join(base: string, extra: unknown): string {
  return typeof extra === "string" && extra ? `${base} ${extra}` : base;
}

/**
 * Owns the selection. Uncontrolled by default; pass `selectedIndex` + `onChange` to keep the
 * selected tab in your own state (a URL param, localStorage, a parent's `mode`). With `manual`,
 * the arrow keys only move focus and Enter / Space picks the tab; otherwise focus selects.
 * Renders a `display: contents` wrapper, so it never takes part in your layout.
 */
export function TabGroup({ className, ...props }: TabGroupProps) {
  return <HeadlessTabGroup {...props} className={join("ui-tabs", className)} />;
}

/**
 * The row of tabs (`role="tablist"`). Arrow keys (Left / Right, or Up / Down with
 * `vertical`), Home and End move between tabs, and only the selected tab is in the Tab order.
 * Pass `aria-label` to name it.
 */
export function TabList({ className, ...props }: TabListProps) {
  return <HeadlessTabList {...props} className={join("ui-tab-list", className)} />;
}

/** Wraps the panels. Optional: a `TabPanel` in order of its `Tab` works without it. */
export function TabPanels({ className, ...props }: TabPanelsProps) {
  return <HeadlessTabPanels {...props} className={join("ui-tab-panels", className)} />;
}

/**
 * The panel of the tab at the same position. Only the selected one is rendered. Headless UI would make it a
 * tab stop (tabIndex 0); it is -1 here so Tab goes from the row to the panel's own controls. Pass
 * `tabIndex={0}` for a panel with nothing focusable inside.
 */
export function TabPanel({ className, tabIndex = -1, ...props }: TabPanelProps) {
  return <HeadlessTabPanel tabIndex={tabIndex} {...props} className={join("ui-tab-panel", className)} />;
}
