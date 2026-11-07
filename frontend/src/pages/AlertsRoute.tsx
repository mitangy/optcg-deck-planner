import { PriceAlertsPage } from "../PriceAlerts";
import { CatalogAddDrawer } from "./collection/CatalogAddDrawer";

export function AlertsRoute() {
  return (
    <PriceAlertsPage
      renderSearch={(renderAction) => (
        <CatalogAddDrawer
          className="alerts-add"
          summary="Search for a card to watch"
          storageKey="optcg_alerts_add_open"
          defaultOpen={false}
          idleHint="Search the catalog by name or ID to watch a card's price"
          renderAction={renderAction}
        />
      )}
    />
  );
}
