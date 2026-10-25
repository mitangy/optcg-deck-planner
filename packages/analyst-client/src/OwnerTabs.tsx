import { Tab, TabGroup, TabList } from "@optcg/ui/tabs";

export type OwnerView = "requests" | "usage";

/** The Requests / Usage row under the Log Pose header (owner only). The caller keeps the view. */
export function OwnerTabs({ view, waiting, onView }: { view: OwnerView; waiting: number; onView: (view: OwnerView) => void }) {
  return (
    <TabGroup selectedIndex={view === "usage" ? 1 : 0} onChange={(i) => onView(i === 1 ? "usage" : "requests")}>
      <TabList className="lp-tabs" aria-label="Owner tools">
        <Tab className="lp-tab">
          Requests
          {waiting > 0 ? <span className="lp-count">{waiting > 99 ? "99+" : waiting}</span> : null}
        </Tab>
        <Tab className="lp-tab">Usage</Tab>
      </TabList>
    </TabGroup>
  );
}
