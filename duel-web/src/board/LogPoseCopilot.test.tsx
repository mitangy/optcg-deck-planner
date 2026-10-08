import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TurnPlan } from "@optcg/analyst-client";
import { TurnPlanCard } from "./LogPoseCopilot";
import type { PlanCardMode } from "./copilot";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const plan: TurnPlan = {
  id: "p1",
  turn: 3,
  summary: "Develop, then swing",
  steps: [
    { action: "play", card: "h1", label: "Play Nami (cost 1)", why: "Curve out" },
    { action: "attack", attacker: "L0", target: "L1", label: "Attack the Leader" },
    { action: "end_turn", label: "End turn" },
  ],
};

const html = (mode: PlanCardMode, busy = false) =>
  renderToStaticMarkup(<TurnPlanCard plan={plan} mode={mode} busy={busy} onPlay={() => {}} onStop={() => {}} onSkip={() => {}} onReplan={() => {}} />);

const buttons = (h: string) => [...h.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => ({ label: m[2], disabled: /disabled/.test(m[1]!) }));

describe("the Turn plan card (#416)", () => {
  it("lists every step with its reason and offers only Play this turn before anything runs (#416)", () => {
    const h = html({ kind: "idle", disabledReason: null });
    expect(h).toContain("Develop, then swing");
    for (const text of ["Play Nami (cost 1)", "Curve out", "Attack the Leader", "End turn"]) expect(h).toContain(text);
    expect(buttons(h)).toEqual([{ label: "Play this turn", disabled: false }]);
  });

  it("disables Play this turn and says why (#416)", () => {
    const h = html({ kind: "idle", disabledReason: "This plan was for an earlier turn." });
    expect(buttons(h)).toEqual([{ label: "Play this turn", disabled: true }]);
    expect(h).toContain("This plan was for an earlier turn.");
  });

  it("highlights the running step and offers Stop (#416)", () => {
    const h = html({ kind: "running", step: 1 });
    expect(h).toContain("Playing step 2 of 3");
    expect(buttons(h)).toEqual([{ label: "Stop", disabled: false }]);
    const items = [...h.matchAll(/<li class="copilot-step"([^>]*)>/g)].map((m) => m[1]);
    expect(items.map((a) => /data-current="true"/.test(a!))).toEqual([false, true, false]);
    expect(items.map((a) => /data-done="true"/.test(a!))).toEqual([true, false, false]);
  });

  it("tells you the plan waits for your answer to a prompt (#416)", () => {
    const h = html({ kind: "choice", step: 0 });
    expect(h).toContain("Your call: answer the prompt, then the plan continues");
    expect(buttons(h)).toEqual([{ label: "Stop", disabled: false }]);
  });

  it("offers Skip step, Re-plan and Stop on a blocked step, with the reason (#416)", () => {
    const h = html({ kind: "blocked", step: 1, reason: "That attack isn't possible any more." });
    expect(h).toContain("That attack isn&#x27;t possible any more.");
    expect(buttons(h).map((b) => b.label)).toEqual(["Skip step", "Re-plan", "Stop"]);
    expect(buttons(html({ kind: "blocked", step: 1, reason: "x" }, true)).find((b) => b.label === "Re-plan")!.disabled).toBe(true);
  });

  it("has no buttons once the plan is done or stopped (#416)", () => {
    expect(buttons(html({ kind: "done" }))).toEqual([]);
    const h = html({ kind: "stopped", step: 1, reason: "You stopped it." });
    expect(buttons(h)).toEqual([]);
    expect(h).toContain("Stopped before step 2.");
  });
});
