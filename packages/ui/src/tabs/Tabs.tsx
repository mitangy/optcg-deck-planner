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

export function TabGroup({ className, ...props }: TabGroupProps) {
  return <HeadlessTabGroup {...props} className={join("ui-tabs", className)} />;
}

export function TabList({ className, ...props }: TabListProps) {
  return <HeadlessTabList {...props} className={join("ui-tab-list", className)} />;
}

export function TabPanels({ className, ...props }: TabPanelsProps) {
  return <HeadlessTabPanels {...props} className={join("ui-tab-panels", className)} />;
}

// Headless UI would make the panel a tab stop (tabIndex 0); it is -1 here so Tab goes from the row to the panel's own controls.
export function TabPanel({ className, tabIndex = -1, ...props }: TabPanelProps) {
  return <HeadlessTabPanel tabIndex={tabIndex} {...props} className={join("ui-tab-panel", className)} />;
}
