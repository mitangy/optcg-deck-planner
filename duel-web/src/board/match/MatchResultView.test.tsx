// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RematchState } from "../../net/protocol";
import { DEMO_VIEW } from "../fixtures/demoViews";
import { MatchResultView, type BoardRematch } from "./MatchResultView";

const state = (over: Partial<RematchState> = {}): RematchState => ({
  available: true,
  requested: [false, false],
  newDeck: [false, false],
  declinedBy: null,
  chooser: null,
  ...over,
});

let root: Root | null = null;
let host: HTMLElement | null = null;
const onLeave = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onLeave.mockClear();
  onBack.mockClear();
});

const onBack = vi.fn();

function open(rematch: BoardRematch | undefined, spectating = false, tournament = false, isReplay = false) {
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <MatchResultView
        over
        resultHidden={false}
        setResultHidden={() => {}}
        result={{ outcome: "loss", headline: "You lost", detail: "Your Leader took damage with 0 Life" } as never}
        isReplay={isReplay}
        wide
        lp={false}
        matchOver={{ winner: 1, reason: "leader_battle_at_zero_life" } as never}
        view={DEMO_VIEW}
        spectating={spectating}
        players={null}
        matchId={null}
        loadMatchRecord={undefined}
        rematch={rematch}
        boardSeat={0}
        canReportPlayer={false}
        reportTargetFor={() => null}
        onLeave={onLeave}
        onBackToTournament={tournament ? onBack : undefined}
      />,
    ),
  );
  const buttons = [...document.querySelectorAll<HTMLElement>(".match-result button, .match-result a")];
  return {
    gold: buttons.filter((b) => b.classList.contains("btn-primary")).map((b) => b.textContent),
    labels: buttons.map((b) => b.textContent),
    button: (name: string) => buttons.find((b) => b.textContent === name)!,
  };
}

const rematch = (s: RematchState | null): BoardRematch => ({ state: s, onAction: () => {} });

describe("match over card has one gold button (#1343)", () => {
  it("the rematch request is gold and Home sits in the quiet row (#1343)", () => {
    const card = open(rematch(state()));
    expect(card.gold).toEqual(["Ask for a rematch"]);
    expect(card.labels).toContain("Home");
    expect(card.labels).toContain("View board");
    expect(card.labels).not.toContain("Return home");
  });

  it("Return home takes the gold when the opponent left, and leaves through onLeave (#1343)", () => {
    const card = open(rematch(state({ available: false })));
    expect(card.gold).toEqual(["Return home"]);
    act(() => card.button("Return home").click());
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("Return home takes the gold when there is no rematch to offer (#1343)", () => {
    expect(open(undefined).gold).toEqual(["Return home"]);
  });

  it("has no gold button while you wait for the opponent's answer, and none for a spectator (#1343)", () => {
    expect(open(rematch(state({ requested: [true, false] }))).gold).toEqual([]);
    expect(open(rematch(state()), true).gold).toEqual([]);
  });
});

describe("match over card in a tournament game (#1385)", () => {
  it("Back to tournament is gold when there is no rematch to offer, Home goes quiet and still leaves (#1385)", () => {
    const card = open(undefined, false, true);
    expect(card.gold).toEqual(["Back to tournament"]);
    expect(card.labels).toContain("Home");
    expect(card.labels).not.toContain("Return home");
    act(() => card.button("Back to tournament").click());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("the gold stays on the rematch offer and Back to tournament is secondary (#1385)", () => {
    const card = open(rematch(state()), false, true);
    expect(card.gold).toEqual(["Ask for a rematch"]);
    expect(card.labels).toContain("Back to tournament");
  });

  it("a spectator or a replay never sees Back to tournament (#1385)", () => {
    expect(open(undefined, true, true).labels).not.toContain("Back to tournament");
    expect(open(undefined, false, true, true).labels).not.toContain("Back to tournament");
  });
});
