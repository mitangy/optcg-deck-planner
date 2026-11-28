// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGameEvents, firstToday, trackSettingChanged } from "./events";
import { SignInLink } from "./SignInLink";
import { isSeoLander, useProductEvents, useSignInPromptShown } from "./useProductEvents";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

function Probe({ path, emit }: { path: string; emit: (name: string, props?: object) => void }) {
  useProductEvents(path, emit as never);
  return null;
}

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

describe("funnel events in the duel app (#1499)", () => {
  it("only the search-facing pages count as a landing, the signed-in app does not (#1499)", () => {
    for (const p of ["/play-one-piece-tcg-online", "/optcg-sim-online", "/play-optcg-on-phone", "/decks/meta", "/leaders", "/leaders/op01-001"]) {
      expect(isSeoLander(p), p).toBe(true);
    }
    for (const p of ["/", "/decks", "/duel", "/history", "/leaderboard"]) expect(isSeoLander(p), p).toBe(false);
  });

  it("a visit that opens on a guide page records one landing with the route pattern, and a reload does not record another (#1499)", () => {
    const emit = vi.fn();
    render(<Probe path="/leaders/op01-001" emit={emit} />);
    expect(emit).toHaveBeenCalledWith("landing", { path: "/leaders/:slug" });
    act(() => root!.unmount());
    const again = vi.fn();
    render(<Probe path="/leaders/op01-001" emit={again} />);
    expect(again).not.toHaveBeenCalled();
  });

  it("a visit that opens on the home page records no landing (#1499)", () => {
    const emit = vi.fn();
    render(<Probe path="/" emit={emit} />);
    expect(emit).not.toHaveBeenCalled();
  });

  it("a sign-in link records one prompt with the route pattern when it appears, not on every re-render (#1499)", () => {
    const emit = vi.fn();
    function Prompt({ n }: { n: number }) {
      useSignInPromptShown("/history/abc123", emit as never);
      return <i>{n}</i>;
    }
    render(<Prompt n={1} />);
    act(() => root!.render(<Prompt n={2} />));
    expect(emit.mock.calls).toEqual([["signup_prompt_shown", { path: "/history/:matchId" }]]);
  });

  it("the sign-in link points at Google login", () => {
    render(<SignInLink className="b">Sign in</SignInLink>);
    expect(host!.querySelector("a")!.getAttribute("href")).toContain("/auth/google");
  });

  it("a settings change reports the key of what changed, never the value, an unchanged key or a layout position (#1499)", () => {
    const emit = vi.fn();
    trackSettingChanged(
      { reduceMotion: true, theme: "dark", devUserKey: "secret", bigBoardChosen: true, handFanPos: { x: 1 }, previewPopupPos: 3, promptPos: 2, panelSizes: [1], popupSize: 2 },
      { reduceMotion: false, theme: "dark", devUserKey: "", bigBoardChosen: false },
      emit,
    );
    expect(emit.mock.calls).toEqual([["setting_changed", { key: "reduceMotion" }]]);
  });

  it("the same page event is sent once a day per tab session (#1499)", () => {
    expect(firstToday("home_view")).toBe(true);
    expect(firstToday("home_view")).toBe(false);
    expect(firstToday("landing")).toBe(true);
  });

  it("a game starts once per match id with the mode stashed at launch and the leader actually played (#1499)", () => {
    const emit = vi.fn();
    const g = createGameEvents(emit);
    g.stash("ranked");
    g.started("m1", "OP01-001", "friend");
    g.started("m1", "OP01-001", "friend");
    g.started("m2", "OP05-060", "friend");
    expect(emit.mock.calls).toEqual([
      ["game_start", { mode: "ranked", leader: "OP01-001" }],
      ["game_start", { mode: "friend", leader: "OP05-060" }],
    ]);
  });

  it("a game ends once per match id and carries the mode its start recorded (#1499)", () => {
    const emit = vi.fn();
    const g = createGameEvents(emit);
    g.stash("bot");
    g.started("m1", "OP01-001", "ranked");
    g.finished("m1", "ranked");
    g.finished("m1", "ranked");
    g.finished("m9", "friend");
    expect(emit.mock.calls.filter(([n]) => n === "game_done")).toEqual([
      ["game_done", { mode: "bot" }],
      ["game_done", { mode: "friend" }],
    ]);
  });
});
