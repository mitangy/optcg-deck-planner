// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, initialGroupCount, noteAnchor, noteTopics, notesFor, olderGroupCount } from "./helpers";
import { lastSeenKey } from "./lastSeen";
import { PATCH_NOTES } from "./notes";
import type { PatchNote } from "./types";
import { WhatsNewFeed, WhatsNewList } from "./WhatsNewList";

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
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

const note = (date: string, title: string, extra: Partial<PatchNote> = {}): PatchNote => ({ date, app: "duel", title, text: `${title} text`, ...extra });
const many = (date: string, count: number, prefix = date): PatchNote[] => Array.from({ length: count }, (_, i) => note(date, `${prefix} n${i}`));

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  return host;
}

const titles = (el: HTMLElement) => [...el.querySelectorAll(".wn-title > span:first-child")].map((s) => s.textContent);
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const button = (el: HTMLElement, text: RegExp | string) =>
  [...el.querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent === text : text.test(b.textContent ?? "")));
const typeInto = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("Show older (#1390)", () => {
  const notes = [...many("2026-11-20", 21, "newest"), note("2026-11-10", "ten days back"), note("2026-10-01", "fifty days back"), note("2026-08-01", "oldest")];

  it("starts with the newest 14 days, then Show older adds the next days and counts what is left (#1390)", async () => {
    const el = await mount(<WhatsNewList notes={notes} />);
    expect(titles(el)).toContain("ten days back");
    expect(titles(el)).not.toContain("fifty days back");
    expect(button(el, /Show older/)?.textContent).toBe("Show older (2 more)");
    await click(button(el, /Show older/));
    expect(titles(el)).toContain("fifty days back");
    expect(titles(el)).not.toContain("oldest");
    expect(button(el, /Show older/)?.textContent).toBe("Show older (1 more)");
    await click(button(el, /Show older/));
    expect(titles(el)).toContain("oldest");
    expect(button(el, /Show older/)).toBeUndefined();
  });

  it("shows at least 20 notes, whole days only, when the last 14 days are quiet (#1390)", () => {
    const quiet = [...many("2026-11-20", 15), ...many("2026-10-01", 10), ...many("2026-09-01", 5)];
    const groups = [
      { date: "2026-11-20", notes: quiet.slice(0, 15) },
      { date: "2026-10-01", notes: quiet.slice(15, 25) },
      { date: "2026-09-01", notes: quiet.slice(25) },
    ];
    expect(initialGroupCount(groups)).toBe(2);
    expect(initialGroupCount(groups.slice(0, 1))).toBe(1);
    expect(initialGroupCount([])).toBe(0);
  });

  it("Show older always adds at least one day, even across a long gap (#1390)", () => {
    const groups = [
      { date: "2026-11-20", notes: many("2026-11-20", 25) },
      { date: "2026-03-01", notes: many("2026-03-01", 1) },
    ];
    expect(olderGroupCount(groups, 1)).toBe(2);
  });
});

describe("month jump (#1390)", () => {
  const notes = [...many("2026-11-20", 21, "nov"), note("2026-10-05", "october one"), note("2026-10-02", "october two"), note("2026-09-01", "september one")];

  it("lists the months and a pick reveals that month and scrolls to its first day (#1390)", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const el = await mount(<WhatsNewList notes={notes} />);
    const rail = el.querySelector("nav.wn-rail")!;
    expect([...rail.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["November 2026", "October 2026", "September 2026"]);
    expect(titles(el)).not.toContain("september one");
    await click(button(rail as HTMLElement, "September 2026"));
    expect(titles(el)).toContain("september one");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("wn-day-2026-09-01");
  });
});

describe("New since your last visit (#1390)", () => {
  const notes = [note("2026-11-20", "fresh"), note("2026-11-19", "fresh too"), note("2026-10-20", "mid"), note("2026-08-01", "old")];

  it("marks what is new, says how many, and still counts the visit as seen (#1390)", async () => {
    localStorage.setItem(lastSeenKey("duel"), "2026-11-18");
    const el = await mount(<WhatsNewFeed app="duel" notes={notes} />);
    expect([...el.querySelectorAll(".wn-note-new")].map((n) => n.querySelector(".wn-title span")?.textContent)).toEqual(["fresh", "fresh too"]);
    expect(el.querySelector(".wn-new-summary")?.textContent).toContain("2 new since your last visit");
    expect(localStorage.getItem(lastSeenKey("duel"))).toBe("2026-11-20");
  });

  it("marks only the unseen note when one PR has notes on several days (#1401)", async () => {
    const sameLabel = [note("2026-11-21", "after", { app: "planner", pr: 1374 }), note("2026-11-19", "before", { app: "planner", pr: 1374 })];
    localStorage.setItem(lastSeenKey("planner"), "2026-11-20");
    const el = await mount(<WhatsNewFeed app="planner" notes={sameLabel} />);
    expect([...el.querySelectorAll(".wn-note-new")].map((n) => n.querySelector(".wn-title span")?.textContent)).toEqual(["after"]);
    expect(el.querySelector(".wn-new-summary")?.textContent).toContain("1 new since your last visit");
  });

  it("a first visit has no New marks (#1390)", async () => {
    const el = await mount(<WhatsNewFeed app="duel" notes={notes} />);
    expect(el.querySelector(".wn-note-new")).toBeNull();
    expect(el.querySelector(".wn-new-summary")).toBeNull();
  });

  it("new notes are on screen even when they are older than 14 days (#1390)", async () => {
    const busy = [...many("2026-11-20", 21, "busy"), note("2026-10-01", "unseen but old"), note("2026-08-01", "seen and old")];
    localStorage.setItem(lastSeenKey("duel"), "2026-09-15");
    const el = await mount(<WhatsNewFeed app="duel" notes={busy} />);
    expect(titles(el)).toContain("unseen but old");
    expect(titles(el)).not.toContain("seen and old");
    expect(el.querySelector(".wn-new-summary")?.textContent).toContain("22 new");
  });
});

describe("topics and search (#1390)", () => {
  it("works out topics from the words and lets a note name its own (#1390)", () => {
    expect(noteTopics(note("2026-11-01", "New alt art for Luffy"))).toContain("cards");
    expect(noteTopics(note("2026-11-01", "Plain", { cards: [{ id: "OP01-001", name: "X", image: "" }] }))).toContain("cards");
    expect(noteTopics(note("2026-11-01", "Plain", { text: "Ranked games are fairer." }))).toEqual(["ranked"]);
    expect(noteTopics(note("2026-11-01", "Plain", { text: "We prevent cheating." }))).toEqual([]);
    expect(noteTopics(note("2026-11-01", "Plain", { text: "On a phone held sideways." }))).toEqual(["phone"]);
    expect(noteTopics(note("2026-11-01", "Plain", { app: "both" }))).toEqual(["shared"]);
    expect(noteTopics(note("2026-11-01", "Ranked phone", { topics: ["cards"] }))).toEqual(["cards"]);
  });

  const notes = [
    note("2026-11-20", "Ranked rating pause"),
    note("2026-11-19", "New alt arts", { text: "Pretty.", cards: [{ id: "OP05-060", name: "Monkey.D.Luffy", image: "" }] }),
    note("2026-11-18", "Shared thing", { app: "both" }),
  ];
  const chipLabels = (el: HTMLElement) => [...el.querySelectorAll(".wn-chip")].map((c) => c.textContent);

  it("a chip shows every match with a count, and only chips that match something appear (#1390)", async () => {
    const el = await mount(<WhatsNewList notes={notes} />);
    expect(chipLabels(el)).toEqual(["All", "New cards", "Ranked & events", "Duel + Planner"]);
    await click(button(el, "Ranked & events"));
    expect(titles(el)).toEqual(["Ranked rating pause"]);
    expect(el.querySelector(".wn-count")?.textContent).toBe("1 update");
    expect(button(el, "Ranked & events")?.getAttribute("aria-pressed")).toBe("true");
    expect(window.location.search).toBe("?topic=ranked");
  });

  it("search matches card names and ids, ignoring case, and says when nothing matches (#1390)", async () => {
    const el = await mount(<WhatsNewList notes={notes} />);
    const input = el.querySelector<HTMLInputElement>("input[type=search]")!;
    await typeInto(input, "LUFFY");
    expect(titles(el)).toEqual(["New alt arts"]);
    expect(window.location.search).toBe("?q=LUFFY");
    await typeInto(input, "op05-060");
    expect(titles(el)).toEqual(["New alt arts"]);
    await typeInto(input, "zzzz");
    expect(el.textContent).toContain("No updates match");
    await click(button(el, "Clear"));
    expect(titles(el)).toHaveLength(3);
    expect(window.location.search).toBe("");
  });

  it("a filter shows every match at once, with no Show older (#1390)", async () => {
    const spread = [...many("2026-11-20", 21), ...Array.from({ length: 25 }, (_, i) => note(addDays("2025-12-01", -i * 40), `rank ${i}`, { text: "A ranked fix." }))];
    const el = await mount(<WhatsNewList notes={spread} />);
    await click(button(el, "Ranked & events"));
    expect(titles(el)).toHaveLength(25);
    expect(button(el, /Show older/)).toBeUndefined();
    expect(el.querySelector(".wn-count")?.textContent).toBe("25 updates");
  });

  it("a search or topic in the address applies on load (#1390)", async () => {
    window.history.replaceState(null, "", "/whats-new?topic=cards&q=luffy");
    const el = await mount(<WhatsNewList notes={[...notes, note("2026-11-17", "Luffy fix")]} />);
    expect(titles(el)).toEqual(["New alt arts"]);
    expect(el.querySelector<HTMLInputElement>("input[type=search]")!.value).toBe("luffy");
  });
});

describe("linkable notes (#1390)", () => {
  it("every real note has its own anchor within each app's list (#1390)", () => {
    for (const app of ["duel", "planner"] as const) {
      const anchors = notesFor(app, PATCH_NOTES).map(noteAnchor);
      expect(new Set(anchors).size).toBe(anchors.length);
      for (const a of anchors) expect(a).toMatch(/^[a-z0-9-]{3,70}$/);
    }
  });

  it("a link to an old note opens the list far enough, scrolls to it and marks it (#1390)", async () => {
    const notes = [...many("2026-11-20", 21), note("2026-03-01", "ancient one")];
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", `/whats-new#${noteAnchor(notes[21])}`);
    const el = await mount(<WhatsNewList notes={notes} />);
    expect(titles(el)).toContain("ancient one");
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe(noteAnchor(notes[21]));
    expect(el.querySelector(".wn-note-target")?.id).toBe(noteAnchor(notes[21]));
  });

  it("Copy link puts the note's address on the clipboard and says so (#1390)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const n = note("2026-11-20", "Copy me");
    const el = await mount(<WhatsNewList notes={[n]} />);
    await click(el.querySelector('button[aria-label="Copy link to Copy me"]'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#${noteAnchor(n)}`);
    expect(el.querySelector(".wn-copied")?.textContent).toBe("Link copied");
  });
});

describe("long notes fold (#1390)", () => {
  it("only notes over the limit fold, and More / Less toggles them (#1390)", async () => {
    const long = note("2026-11-20", "Long", { text: "x".repeat(261) });
    const edge = note("2026-11-20", "Edge", { text: "y".repeat(260) });
    const el = await mount(<WhatsNewList notes={[long, edge]} />);
    expect(el.querySelectorAll(".wn-more")).toHaveLength(1);
    expect(el.querySelectorAll(".wn-text-clamped")).toHaveLength(1);
    const more = el.querySelector<HTMLButtonElement>(".wn-more")!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(more.textContent).toBe("Less");
    expect(el.querySelector(".wn-text-clamped")).toBeNull();
  });

  it("a search match shows the whole note (#1390)", async () => {
    const long = note("2026-11-20", "Long", { text: `needle ${"x".repeat(260)}` });
    const el = await mount(<WhatsNewList notes={[long]} />);
    await typeInto(el.querySelector<HTMLInputElement>("input[type=search]")!, "needle");
    expect(el.querySelector(".wn-text-clamped")).toBeNull();
  });
});
