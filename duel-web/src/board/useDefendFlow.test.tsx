// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Intent, PlayerView } from "../net/protocol";
import { AUTO_PASS_BEAT_MS } from "./gameplayPrefs";
import { DEMO_VIEW } from "./fixtures/demoViews";
import { stubBattle } from "./fixtures/stubCard";
import { useDefendFlow } from "./useDefendFlow";

// ST01-003 Karoo prints +1000 and has a Counter; ST01-006 Chopper has none.
const hand = [
  { id: "y-h1", defId: "ST01-006" },
  { id: "y-h2", defId: "ST01-003" },
];
const view: PlayerView = {
  ...DEMO_VIEW,
  you: { ...DEMO_VIEW.you, activeDonCount: 1, hand },
  battle: stubBattle({ attackerSeat: 1, attackerId: "o-c1", target: { kind: "leader" } }),
};
const blockStep: Intent[] = [{ type: "pass_block" }, { type: "declare_block", blockerId: "y-c1" }];
const counterStep: Intent[] = [
  { type: "pass_counter" },
  { type: "counter_from_hand", handIndex: 0 },
  { type: "counter_from_hand", handIndex: 1 },
];

type Flow = ReturnType<typeof useDefendFlow>;
type Opts = Partial<Parameters<typeof useDefendFlow>[0]>;

let root: Root;
let host: HTMLElement;
let flow: Flow;
let sent: Intent[];

function Probe({ opts }: { opts: Parameters<typeof useDefendFlow>[0] }) {
  flow = useDefendFlow(opts);
  return null;
}

function render(intents: Intent[], extra: Opts = {}) {
  act(() => {
    root.render(
      <Probe
        opts={{
          view,
          intents,
          stopMode: "always",
          spectating: false,
          isReplay: false,
          over: false,
          vsHuman: false,
          // A phone: the defend tray takes the hand's place, so the staged cards live in it.
          wide: false,
          lp: false,
          onSendIntent: (i) => sent.push(i),
          ...extra,
        }}
      />,
    );
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  sent = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("answering an attack: the queued Counter (refactor 3.2)", () => {
  it("a Counter queued in the block step is staged in the tray once the counter step is up, after the step reset (refactor 3.2)", () => {
    render(blockStep);
    expect(flow.defend?.phase).toBe("block");
    act(() => flow.skipBlockToCounter("y-h2", "stage"));
    // The block is passed first; the Counter waits for the next step.
    expect(sent).toEqual([{ type: "pass_block" }]);
    expect(flow.defend?.stagedIds).toEqual([]);
    render(counterStep);
    expect(flow.defend?.phase).toBe("counter");
    expect(flow.defend?.stagedIds).toEqual(["y-h2"]);
  });

  it("with the rail (no confirm step) the queued Counter is played, not staged (refactor 3.2)", () => {
    render(blockStep);
    act(() => flow.skipBlockToCounter("y-h2", "send"));
    render(counterStep);
    expect(sent).toEqual([{ type: "pass_block" }, { type: "counter_from_hand", handIndex: 1 }]);
    expect(flow.defend?.stagedIds).toEqual([]);
  });
});

describe("response stops (refactor 3.2)", () => {
  const onlyPass: Intent[] = [{ type: "pass_counter" }];

  it("passes for you when passing is the only choice, after a beat (refactor 3.2)", () => {
    vi.useFakeTimers();
    render(onlyPass, { stopMode: "auto" });
    expect(flow.autoPass).toEqual({ type: "pass_counter" });
    expect(sent).toEqual([]);
    act(() => void vi.advanceTimersByTime(AUTO_PASS_BEAT_MS));
    expect(sent).toEqual([{ type: "pass_counter" }]);
  });

  it("never passes for a replay viewer, who only watches (refactor 3.2)", () => {
    vi.useFakeTimers();
    render(onlyPass, { stopMode: "auto", isReplay: true });
    expect(flow.autoPass).toBeNull();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(sent).toEqual([]);
  });
});
