import { describe, expect, it } from "vitest";
import type { PendingChoiceView, PlayerView } from "../net/protocol";
import { DEMO_VIEW } from "../pages/DemoPage";
import type { Box } from "./battleArc";
import { confirmQuestion, handConfirmAnchor, handUseFromIntent, type HandUse } from "./handPrompt";

const HAKI_PROMPT =
  "Color of the Supreme King Haki — rest 1 of your DON!! cards, and if you do, give your opponent's Leader and all of their Characters -1000 power during this turn? [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle. Then, you may rest 1 of your DON!! cards.";

const SLOT: Box = { left: 300, top: 600, width: 70, height: 98 };
const HAKI_USE: HandUse = { instanceId: "h-haki", defId: "OP12-018", box: SLOT };

function hakiConfirm(over: Partial<PendingChoiceView> = {}): PendingChoiceView {
  return {
    id: "choice_1",
    seat: 0,
    kind: "effect",
    cardDefId: "OP12-018",
    sourceInstanceId: "h-haki",
    optional: true,
    prompt: HAKI_PROMPT,
    request: { type: "confirm" },
    ...over,
  };
}

/** Your side with the Haki mid-resolution (out of the hand, not yet trashed). */
function you(over: Partial<PlayerView["you"]> = {}): PlayerView["you"] {
  return {
    ...DEMO_VIEW.you,
    hand: [{ id: "h-other", defId: "OP01-006" }],
    resolving: [{ id: "h-haki", defId: "OP12-018" }],
    ...over,
  };
}

describe("hand-anchored Yes/No", () => {
  it("remembers which hand card an intent used and where it sat (#270)", () => {
    const hand = [
      { id: "h-other", defId: "OP01-006" },
      { id: "h-haki", defId: "OP12-018" },
    ];
    const measured: string[] = [];
    const use = handUseFromIntent({ type: "counter_event", handIndex: 1 }, hand, (id) => {
      measured.push(id);
      return SLOT;
    });
    expect(use).toEqual({ instanceId: "h-haki", defId: "OP12-018", box: SLOT });
    expect(measured).toEqual(["h-haki"]);
  });

  it("puts the Haki's rest-a-DON!! Yes/No on its hand slot instead of a pop-up (#270)", () => {
    expect(handConfirmAnchor(hakiConfirm(), 0, HAKI_USE, you())).toEqual(SLOT);
  });

  it("keeps the pop-up with Can't pay for an unpayable cost asked by the card just used from the hand (#374)", () => {
    expect(handConfirmAnchor(hakiConfirm({ unpayable: true }), 0, HAKI_USE, you())).toBeNull();
    expect(handConfirmAnchor(hakiConfirm({ unpayable: false }), 0, HAKI_USE, you())).toEqual(SLOT);
  });

  it("keeps the pop-up for a card other than the one just used from the hand (#270)", () => {
    const other = hakiConfirm({ sourceInstanceId: "y-c1", cardDefId: "OP01-016" });
    expect(handConfirmAnchor(other, 0, HAKI_USE, you())).toBeNull();
  });

  it("keeps the pop-up once the used card is no longer resolving (#270)", () => {
    expect(handConfirmAnchor(hakiConfirm(), 0, HAKI_USE, you({ resolving: [] }))).toBeNull();
  });

  it("keeps the pop-up for a pick from that card (#270)", () => {
    const select = hakiConfirm({ request: { type: "select", min: 0, max: 1, options: [] } });
    expect(handConfirmAnchor(select, 0, HAKI_USE, you())).toBeNull();
  });

  it("does not answer the opponent's choice above your hand (#270)", () => {
    expect(handConfirmAnchor(hakiConfirm({ seat: 1 }), 0, HAKI_USE, you())).toBeNull();
  });

  it("asks only the question, without the card name or the full card text (#270)", () => {
    expect(confirmQuestion(HAKI_PROMPT)).toBe(
      "Rest 1 of your DON!! cards, and if you do, give your opponent's Leader and all of their Characters -1000 power during this turn?",
    );
    expect(confirmQuestion("Nami — pay the cost to activate: [Main] You may trash 1 card…")).toBe(
      "Pay the cost to use this effect?",
    );
  });
});
