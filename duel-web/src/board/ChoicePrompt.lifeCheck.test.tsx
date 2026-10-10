import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PendingChoiceView } from "../net/protocol";
import { ChoicePrompt, confirmIntent } from "./ChoicePrompt";

// Card art reads saved art prefs; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

function lifeCheck(noTrigger: boolean): PendingChoiceView {
  return {
    id: "c1",
    seat: 0,
    kind: "life_trigger",
    cardDefId: "ST01-003",
    optional: true,
    prompt: noTrigger ? "Karoo has no [Trigger]. Add it to your hand." : "Karoo — activate this card's [Trigger]?",
    request: { type: "confirm" },
    privateToSeat: 0,
    hideCardDefFromOthers: true,
    ...(noTrigger ? { noTrigger: true } : {}),
  };
}

const render = (choice: PendingChoiceView) => renderToStaticMarkup(<ChoicePrompt choice={choice} mySeat={0} onSend={() => {}} />);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).filter((t) => t && t !== "Hide");

describe("Life check prompt (#352)", () => {
  it("shows one No Trigger button for a Life card without [Trigger] (#352)", () => {
    const labels = buttons(render(lifeCheck(true)));
    expect(labels).toEqual(["No Trigger"]);
  });

  it("keeps Activate Trigger / Add to hand for a [Trigger] card (#352)", () => {
    expect(buttons(render(lifeCheck(false)))).toEqual(["Activate Trigger", "Add to hand"]);
  });

  it("never answers accept:true to a no-Trigger check, whichever key was pressed (#352)", () => {
    expect(confirmIntent(lifeCheck(true), true)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(confirmIntent(lifeCheck(true), false)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(confirmIntent(lifeCheck(false), true)).toEqual({ type: "resolve_pending_choice", accept: true });
    expect(confirmIntent({ kind: "effect" }, true)).toEqual({ type: "resolve_pending_choice", accept: true });
  });
});

describe("Life check pop-up is just the card (#495)", () => {
  it("shows the Life card at full size with no header or prompt text (#495)", () => {
    const html = render(lifeCheck(false));
    expect(html).toContain("life-trigger-card");
    expect(html).toContain("card-tile");
    expect(html).not.toContain("compact");
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("<p>");
  });

  it("keeps the prompt text and header on other confirms (#495)", () => {
    const html = render({ ...lifeCheck(false), kind: "effect", prompt: "Pay the cost to activate?" });
    expect(html).not.toContain("life-trigger-card");
    expect(html).toContain("<h3");
    expect(html).toContain("Pay the cost to activate?");
  });

  it("falls back to the boxed prompt when the Life card is hidden from this seat (#495)", () => {
    const html = render({ ...lifeCheck(false), cardDefId: "HIDDEN" });
    expect(html).not.toContain("life-trigger-card");
    expect(html).toContain("<h3");
    expect(html).toContain("<p>");
  });
});
