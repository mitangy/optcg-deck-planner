import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
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

const html = (m: DefendModel, handCount?: number, open?: { handOpen: boolean; handView: ReactNode }) =>
  renderToStaticMarkup(
    <DefendTray
      model={m}
      ownerSeat={0}
      clock={null}
      handCount={handCount}
      handOpen={open?.handOpen}
      handView={open?.handView}
      onToggleHand={() => {}}
      onToggleBlocker={() => {}}
      onToggleCounter={() => {}}
      onCounterEvent={() => {}}
    />,
  );

describe("defend tray hand count on phones (#660)", () => {
  it("shows how many cards are in your hand beside the verdict (#660)", () => {
    const h = html(model(), 6);
    expect(h).toContain("Hand 6");
    expect(h).toContain('aria-label="Show your hand, 6 cards"');
    expect(h).toContain('aria-expanded="false"');
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

describe("defend tray hand toggle (#1368)", () => {
  const counters = [{ id: "c1", defId: "ST01-001", name: "Karoo", value: 1000 }] as DefendModel["counters"];

  it("shows the hand in place of the Counter chips once it is open (#1368)", () => {
    const h = html(model({ counters }), 6, { handOpen: true, handView: <i className="the-hand" /> });
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain("Hide your hand");
    expect(h).toContain("the-hand");
    expect(h).not.toContain("defend-chips");
  });

  it("keeps the Counter chips while the hand is closed (#1368)", () => {
    const h = html(model({ counters }), 6, { handOpen: false, handView: <i className="the-hand" /> });
    expect(h).toContain("defend-chips");
    expect(h).not.toContain("the-hand");
  });
});
