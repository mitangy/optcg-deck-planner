import { describe, expect, it } from "vitest";
import { DEMO_VIEW } from "../pages/DemoPage";
import type { PlayerView } from "../net/protocol";
import { describeBattle } from "./battleBanner";

// Distinct leader cards so the banner can't pass by naming the wrong one.
const VIEW: PlayerView = {
  ...DEMO_VIEW,
  you: { ...DEMO_VIEW.you, leader: { ...DEMO_VIEW.you.leader, defId: "MY-LEADER" } },
  opponent: { ...DEMO_VIEW.opponent, leader: { ...DEMO_VIEW.opponent.leader, defId: "OPP-LEADER" } },
};
const nameOf = (defId: string) => defId;

function banner(battle: unknown, fromSeat = false): string {
  return describeBattle({ ...VIEW, battle }, nameOf, fromSeat);
}

describe("describeBattle", () => {
  it("names the defending seat's Leader when a Character attacks a Leader", () => {
    const oppChar = VIEW.opponent.characters.find((c) => c.id === "o-c1")!;
    const myChar = VIEW.you.characters.find((c) => c.id === "y-c3")!;
    expect(banner({ attackerSeat: 1, attackerId: "o-c1", target: { kind: "leader" } })).toBe(
      `Battle: ${oppChar.defId} (${oppChar.power}) → MY-LEADER (${VIEW.you.leader.power})`,
    );
    expect(banner({ attackerSeat: 0, attackerId: "y-c3", target: { kind: "leader" } })).toBe(
      `Battle: ${myChar.defId} (${myChar.power}) → OPP-LEADER (${VIEW.opponent.leader.power})`,
    );
  });

  it("reads from your seat as Their Leader and your Leader (#277)", () => {
    const oppChar = VIEW.opponent.characters.find((c) => c.id === "o-c1")!;
    expect(banner({ attackerSeat: 1, attackerId: "o-c1", target: { kind: "leader" } }, true)).toBe(
      `${oppChar.defId} ${oppChar.power} → your Leader ${VIEW.you.leader.power}`,
    );
    expect(banner({ attackerSeat: 1, attackerId: VIEW.opponent.leader.id, target: { kind: "leader" } }, true)).toBe(
      `Their Leader ${VIEW.opponent.leader.power} → your Leader ${VIEW.you.leader.power}`,
    );
    expect(banner({ attackerSeat: 0, attackerId: VIEW.you.leader.id, target: { kind: "leader" } }, true)).toBe(
      `Your Leader ${VIEW.you.leader.power} → their Leader ${VIEW.opponent.leader.power}`,
    );
  });
});
