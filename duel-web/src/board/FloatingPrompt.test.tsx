import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PendingChoiceView } from "../net/protocol";
import { FloatingPrompt } from "./FloatingPrompt";

// Card art and settings read localStorage; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

function lookChoice(): PendingChoiceView {
  return {
    id: "c1",
    seat: 0,
    kind: "effect",
    optional: false,
    prompt: "Look at the top 2 cards, reveal up to 1.",
    request: {
      type: "look",
      options: [
        { id: "o0", defId: "ST01-003", zone: "deck", ownerSeat: 0, eligible: true, label: "First" },
        { id: "o1", defId: "ST01-004", zone: "deck", ownerSeat: 0, eligible: false, label: "Second" },
      ],
      minSelect: 0,
      maxSelect: 1,
      groups: [{ label: "Up to 1: add to hand", max: 1, eligibleIds: ["o0"] }],
      rest: "deck_bottom",
      restLabel: "",
    },
  } as PendingChoiceView;
}

describe("floating search prompt", () => {
  it("search pop-up floats cards with no gray backdrop (#542)", () => {
    const html = renderToStaticMarkup(<FloatingPrompt choice={lookChoice()} mySeat={0} onSend={() => {}} />);
    expect(html).toContain("float-card");
    expect(html).not.toContain("float-scrim");
  });
});
