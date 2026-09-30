import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PendingChoiceView } from "../net/protocol";
import { ChoicePrompt } from "./ChoicePrompt";

// Card art reads saved art prefs; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

function lookChoice(rest: "deck_top" | "deck_bottom"): PendingChoiceView {
  return {
    id: "c1",
    seat: 0,
    kind: "effect",
    optional: false,
    prompt: "Look at the top 2 cards.",
    request: {
      type: "look",
      options: [
        { id: "o0", defId: "ST01-003", zone: "deck", ownerSeat: 0, eligible: false, label: "First" },
        { id: "o1", defId: "ST01-004", zone: "deck", ownerSeat: 0, eligible: false, label: "Second" },
      ],
      minSelect: 0,
      maxSelect: 0,
      groups: [],
      rest,
      restLabel: "",
    },
  } as PendingChoiceView;
}

/** Rows of the put-back list, top of deck first. */
function rows(rest: "deck_top" | "deck_bottom"): string[] {
  const html = renderToStaticMarkup(<ChoicePrompt choice={lookChoice(rest)} mySeat={0} onSend={() => {}} />);
  return [...html.matchAll(/class="order-rest"|choice-order-name">([^<]+)</g)].map((m) => m[1] ?? "REST");
}

describe("put-back order list", () => {
  it("cards returned to the bottom are listed below the rest of the deck", () => {
    expect(rows("deck_bottom")).toEqual(["REST", "First", "Second"]);
  });

  it("cards returned to the top are listed above the rest of the deck", () => {
    expect(rows("deck_top")).toEqual(["First", "Second", "REST"]);
  });
});
