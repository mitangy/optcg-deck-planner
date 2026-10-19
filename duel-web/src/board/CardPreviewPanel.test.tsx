import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

import { CardPreviewPanel } from "./CardPreviewPanel";
import { setAutoPreviewCard } from "./cardPreview";
import { updateSettings } from "../settings";

describe("card preview panel live status", () => {
  beforeEach(() => {
    setAutoPreviewCard({
      defId: "ST01-001",
      instanceId: "y-leader",
      live: { power: 5000, printedPower: 5000, rested: true, statusLabels: ["Summoning sick"] },
    });
  });

  it("big card mode shows no power / status footer under the art, compact mode still does (#449)", () => {
    updateSettings({ previewBigCard: true });
    const big = renderToStaticMarkup(<CardPreviewPanel />);
    expect(big).toContain("card-preview-big");
    expect(big).not.toContain("live-status");

    updateSettings({ previewBigCard: false });
    const compact = renderToStaticMarkup(<CardPreviewPanel />);
    expect(compact).toContain("card-preview-compact");
    expect(compact).toContain("live-status");
  });
});
