import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PendingChoiceView } from "../net/protocol";
import { ChoicePrompt, confirmIntent } from "./ChoicePrompt";

// Card art reads saved art prefs; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const costConfirm = (unpayable: boolean): PendingChoiceView => ({
  id: "c1",
  seat: 0,
  kind: "effect",
  cardDefId: "ST01-003",
  optional: true,
  prompt: "Karoo — pay the cost to activate: You may trash 1 card with a Trigger from your hand",
  request: { type: "confirm" },
  ...(unpayable ? { unpayable: true } : {}),
});

const emptyPick: PendingChoiceView = {
  id: "c2",
  seat: 0,
  kind: "effect",
  cardDefId: "ST01-003",
  optional: false,
  prompt: "Karoo — no card to play. Confirm to continue.",
  request: { type: "select", min: 0, max: 0, options: [] },
  privateToSeat: 0,
};

const render = (choice: PendingChoiceView) => renderToStaticMarkup(<ChoicePrompt choice={choice} mySeat={0} onSend={() => {}} />);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]?.replace(/&#x27;/g, "'")).filter((t) => t && t !== "Hide");

describe("private choices (#369)", () => {
  it("shows a single Can't pay button for a cost that cannot be paid (#369)", () => {
    expect(buttons(render(costConfirm(true)))).toEqual(["Can't pay"]);
  });

  it("keeps Yes / No for a cost that can be paid (#369)", () => {
    expect(buttons(render(costConfirm(false)))).toEqual(["Yes", "No"]);
  });

  it("never answers accept:true to an unpayable cost, whichever key was pressed (#369)", () => {
    expect(confirmIntent(costConfirm(true), true)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(confirmIntent(costConfirm(true), false)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(confirmIntent(costConfirm(false), true)).toEqual({ type: "resolve_pending_choice", accept: true });
  });

  it("a pick with no candidates offers one enabled Continue button instead of Choose up to 0 (#369)", () => {
    const html = render(emptyPick);
    expect(buttons(html)).toEqual(["Continue"]);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
    expect(html).toContain("No card to choose");
    expect(html).not.toContain("Choose up to 0");
  });
});
