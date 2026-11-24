// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DeckDetail } from "../../api";
import { DeckEditorPanel } from "./DeckEditorPanel";

let available: ((ask: { prompt: string; send?: boolean }) => void) | null = null;

vi.mock("@optcg/analyst-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@optcg/analyst-client")>()),
  useLogPoseAsk: () => available,
}));

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
  available = null;
});

const deck = { id: 1, name: "Luffy", leader_card_id: "OP01-001", leader_name: "Zoro", prior_decks: [], cards: [] } as DeckDetail;

async function render() {
  // The page passes Replace with deck list too, so the row exists either way.
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DeckEditorPanel deckId={1} deck={deck} onUpdated={() => {}} onReplaceList={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}
const describeButton = () => [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes("Describe a card"));

describe("Describe a card in the deck editor (#1450)", () => {
  it("opens Log Pose with the start of a sentence in the box and does not send it (#1450)", async () => {
    const ask = vi.fn();
    available = ask;
    await render();
    await act(async () => describeButton()!.click());
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toMatchObject({ prompt: expect.stringMatching(/^Find cards that /), send: false });
  });

  it("has no button when Log Pose isn't available to this player (#1450)", async () => {
    await render();
    expect(describeButton()).toBeUndefined();
  });
});
