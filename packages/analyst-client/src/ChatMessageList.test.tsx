// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatMessages } from "./ChatMessageList";
import { parseCardList } from "./cardLists";
import type { Msg } from "./chatMessages";
import type { DeckEditor } from "./proposals";

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
});

const list = parseCardList({ id: "l1", title: "Red Straw Hats", cards: [{ id: "OP01-022", name: "Brook", type: "character", colors: ["red"], cost: 4 }] })!;

async function render(messages: Msg[], editor: DeckEditor | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const feedback = { votes: new Map(), rate: vi.fn() } as unknown as Parameters<typeof ChatMessages>[0]["feedback"];
  await act(async () =>
    root!.render(<ChatMessages messages={messages} busy={false} threadId={1} feedback={feedback} editor={editor} game={null} phone={false} onClose={() => {}} submit={() => {}} />),
  );
}

describe("chat messages with a card list (#1450)", () => {
  it("shows the card list under the answer, with Add buttons for the open deck (#1450)", async () => {
    const editor: DeckEditor = { ref: "planner:1", cards: [], apply: async () => {} };
    await render([{ role: "assistant", text: "Two match.", citations: [], cardLists: [list] }], editor);
    expect(host!.textContent).toContain("Two match.");
    expect(host!.querySelector('section[aria-label="Cards: Red Straw Hats"]')).toBeTruthy();
    expect(host!.querySelector('button[aria-label="Add one Brook"]')).toBeTruthy();
  });

  it("shows a card list even when the answer has no text (#1450)", async () => {
    await render([{ role: "assistant", text: "", citations: [], cardLists: [list] }], null);
    expect(host!.querySelector('section[aria-label="Cards: Red Straw Hats"]')).toBeTruthy();
  });
});
