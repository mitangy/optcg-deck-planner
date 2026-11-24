// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeckEditor } from "./board/DeckEditor";
import type { SavedDeck } from "./decks/storage";

let available: ((ask: { prompt: string; send?: boolean }) => void) | null = null;

vi.mock("@optcg/analyst-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@optcg/analyst-client")>()),
  useLogPoseAsk: () => available,
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  available = null;
});

const deck = { id: "d1", name: "Test", leaderId: "OP01-001", cards: [], updatedAt: 0 } as unknown as SavedDeck;

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<DeckEditor deck={deck} onChange={() => {}} />));
}
const describeButtons = () => [...host!.querySelectorAll("button")].filter((b) => b.textContent?.includes("Describe a card"));

describe("Describe a card in the duel deck editor (#1456)", () => {
  it("opens Log Pose with the start of a sentence in the box and does not send it (#1456)", () => {
    const ask = vi.fn();
    available = ask;
    render();
    expect(describeButtons()).toHaveLength(1);
    act(() => describeButtons()[0]!.click());
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toMatchObject({ prompt: expect.stringMatching(/^Find cards that $/), send: false });
  });

  it("has no button when Log Pose isn't available to this player (#1456)", () => {
    render();
    expect(describeButtons()).toHaveLength(0);
  });
});
