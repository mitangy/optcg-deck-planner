import { ALERTS_ADD_OPEN_KEY } from "../storage/keys";
import { PriceAlertsPage } from "../prices/PriceAlerts";
import { CatalogAddDrawer } from "./collection/CatalogAddDrawer";

export function AlertsRoute() {
  return (
    <PriceAlertsPage
      renderSearch={(renderAction) => (
        <CatalogAddDrawer
          className="alerts-add"
          summary="Search for a card to watch"
          storageKey={ALERTS_ADD_OPEN_KEY}
          defaultOpen={false}
          idleHint="Search the catalog by name or ID to watch a card's price"
          renderAction={renderAction}
        />
      )}
    />
  );
}
