import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DefendTray } from "./DefendTray";
import type { DefendModel } from "./defendModel";

const model = (over: Partial<DefendModel> = {}): DefendModel => ({
  phase: "counter",
  attackerName: "Zoro",
  attackerPower: 6000,
  defenderName: "Luffy",
  defenderPower: 5000,
  blocking: false,
  preview: false,
  gap: 2000,
  remaining: 2000,
  blockers: [],
  counters: [],
  events: [],
  earlyCounters: [],
  stagedIds: [],
  stagedTotal: 0,
  stagedUnknown: false,
  stagedBlockerId: null,
  ...over,
});

const html = (m: DefendModel, handCount?: number) =>
  renderToStaticMarkup(
    <DefendTray
      model={m}
      ownerSeat={0}
      clock={null}
      handCount={handCount}
      onToggleBlocker={() => {}}
      onToggleCounter={() => {}}
      onCounterEvent={() => {}}
    />,
  );

describe("defend tray hand count on phones (#660)", () => {
  it("shows how many cards are in your hand beside the verdict (#660)", () => {
    const h = html(model(), 6);
    expect(h).toContain("Hand 6");
    expect(h).toContain('aria-label="Your hand: 6 cards"');
    expect(h).not.toContain("→ 6");
  });

  it("shows the hand after the staged counters (#660)", () => {
    const h = html(model({ stagedIds: ["a", "b"], stagedTotal: 2000, remaining: 0 }), 6);
    expect(h).toContain("Hand 6 → 4");
    expect(h).toContain("6 cards, 4 after these counters");
  });

  it("leaves the hand count out when the hand is already on screen (#660)", () => {
    expect(html(model())).not.toContain("Hand ");
  });
});
