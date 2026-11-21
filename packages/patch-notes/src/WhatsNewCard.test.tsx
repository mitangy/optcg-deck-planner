// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadUnseen, lastSeenKey } from "./lastSeen";
import type { PatchNote } from "./types";
import { WhatsNewCard } from "./WhatsNewCard";

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
  localStorage.clear();
});

const notes: PatchNote[] = [{ date: "2026-11-21", app: "duel", title: "fresh", text: "fresh text" }];

async function mountCard(): Promise<HTMLElement> {
  localStorage.setItem(lastSeenKey("duel"), "2026-11-20");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const Link = ({ to, className, onClick, children }: { to: string; className?: string; onClick?: () => void; children: React.ReactNode }) => (
    <a href={to} className={className} onClick={(e) => { e.preventDefault(); onClick?.(); }}>
      {children}
    </a>
  );
  await act(async () => {
    root!.render(<WhatsNewCard app="duel" Link={Link} notes={notes} />);
  });
  return host;
}

describe("See all keeps the notes unseen for the page (#1401)", () => {
  it("See all closes the card without marking anything seen (#1401)", async () => {
    const el = await mountCard();
    await act(async () => {
      (el.querySelector(".wn-card-link") as HTMLElement).click();
    });
    expect(el.querySelector(".wn-card")).toBeNull();
    expect(loadUnseen("duel", localStorage, notes)).toHaveLength(1);
  });

  it("Got it closes the card and marks the notes seen (#1401)", async () => {
    const el = await mountCard();
    await act(async () => {
      (el.querySelector(".wn-card-dismiss") as HTMLElement).click();
    });
    expect(el.querySelector(".wn-card")).toBeNull();
    expect(loadUnseen("duel", localStorage, notes)).toHaveLength(0);
  });
});
