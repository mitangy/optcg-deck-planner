// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RematchPlan } from "../../state/connectionLoss";

const friendsState = vi.hoisted(() => ({ friends: [] as { username: string }[] }));
vi.mock("../../friends/FriendsPanel", () => ({
  useFriends: (enabled: boolean) => ({ state: enabled ? { friends: friendsState.friends } : null, loadError: null, refresh: async () => undefined }),
}));

import { GameLostOverlay, ReconnectingPill } from "./ConnectionStatus";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  friendsState.friends = [];
});

function render(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

const deck = { leaderId: "ST01-001", deck: ["ST01-002"] };
const botPlan: RematchPlan = { deck, bot: { level: "normal", deck }, opponentName: null };
const friendPlan: RematchPlan = { deck, bot: null, opponentName: "Zoro" };
const buttons = () => [...document.body.querySelectorAll("button")];
const rematch = () => buttons().find((b) => b.textContent === "Rematch")!;

describe("connection status (#1500)", () => {
  it("the pill says Reconnecting… as a status, not a button (#1500)", () => {
    render(<ReconnectingPill />);
    const pill = document.querySelector("[role=status]")!;
    expect(pill.textContent).toContain("Reconnecting…");
    expect(pill.querySelector("button")).toBeNull();
  });

  it("the restart screen says why and offers Rematch and Back to home (#1500)", () => {
    render(<GameLostOverlay plan={botPlan} onRematch={() => undefined} onHome={() => undefined} />);
    expect(document.body.textContent).toContain("The server restarted and this game couldn't continue");
    expect(buttons().map((b) => b.textContent).filter(Boolean)).toEqual(["Rematch", "Back to home"]);
  });

  it("a bot game can always rematch with the same decks, one tap (#1500)", () => {
    const onRematch = vi.fn();
    render(<GameLostOverlay plan={botPlan} onRematch={onRematch} onHome={() => undefined} />);
    expect(rematch().disabled).toBe(false);
    act(() => rematch().click());
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it("a game against a friend can rematch, against someone who is not a friend it cannot (#1500)", () => {
    friendsState.friends = [{ username: "zoro" }];
    render(<GameLostOverlay plan={friendPlan} onRematch={() => undefined} onHome={() => undefined} />);
    expect(rematch().disabled).toBe(false);
    act(() => root!.unmount());
    host!.remove();
    friendsState.friends = [{ username: "Nami" }];
    render(<GameLostOverlay plan={friendPlan} onRematch={() => undefined} onHome={() => undefined} />);
    expect(rematch().disabled).toBe(true);
  });

  it("Back to home works whether or not a rematch is possible (#1500)", () => {
    const onHome = vi.fn();
    render(<GameLostOverlay plan={null} onRematch={() => undefined} onHome={onHome} />);
    expect(rematch().disabled).toBe(true);
    act(() => buttons().find((b) => b.textContent === "Back to home")!.click());
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
