import { describe, expect, it } from "vitest";
import { groupByDate, latestNoteDate, notesFor, unseenNotes } from "./helpers";
import { lastSeenKey, loadUnseen, markSeen, readLastSeen, type NotesStorage } from "./lastSeen";
import { PATCH_NOTES } from "./notes";
import type { PatchNote } from "./types";

const note = (date: string, app: PatchNote["app"], title: string): PatchNote => ({ date, app, title, text: `${title} text` });

const NOTES: PatchNote[] = [
  note("2026-10-03", "duel", "duel-old"),
  note("2026-10-08", "planner", "planner-new"),
  note("2026-10-05", "both", "both-mid"),
  note("2026-10-08", "duel", "duel-new-a"),
  note("2026-10-08", "duel", "duel-new-b"),
];

function memoryStorage(initial: Record<string, string> = {}): NotesStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("notesFor (#450)", () => {
  it("duel gets its own and shared notes but not planner-only ones, and planner the reverse (#450)", () => {
    expect(notesFor("duel", NOTES).map((n) => n.title)).toEqual(["duel-new-a", "duel-new-b", "both-mid", "duel-old"]);
    expect(notesFor("planner", NOTES).map((n) => n.title)).toEqual(["planner-new", "both-mid"]);
  });

  it("lists the newest day first whatever order the file has them in, and keeps same-day order (#450)", () => {
    const dates = notesFor("duel", NOTES).map((n) => n.date);
    expect(dates).toEqual(["2026-10-08", "2026-10-08", "2026-10-05", "2026-10-03"]);
    expect(notesFor("duel", NOTES).slice(0, 2).map((n) => n.title)).toEqual(["duel-new-a", "duel-new-b"]);
  });

  it("reports the newest date for the app (#450)", () => {
    expect(latestNoteDate("planner", NOTES)).toBe("2026-10-08");
    expect(latestNoteDate("duel", [note("2026-10-05", "both", "x"), note("2026-10-09", "planner", "y")])).toBe("2026-10-05");
    expect(latestNoteDate("duel", [])).toBeNull();
  });
});

describe("unseenNotes (#450)", () => {
  it("returns only notes strictly newer than the last seen day (#450)", () => {
    expect(unseenNotes("duel", "2026-10-05", NOTES).map((n) => n.title)).toEqual(["duel-new-a", "duel-new-b"]);
    expect(unseenNotes("duel", "2026-10-04", NOTES).map((n) => n.title)).toEqual(["duel-new-a", "duel-new-b", "both-mid"]);
    expect(unseenNotes("duel", "2026-10-08", NOTES)).toEqual([]);
  });

  it("returns nothing for a visitor with no recorded day, so the backlog is never dumped (#450)", () => {
    expect(unseenNotes("duel", null, NOTES)).toEqual([]);
  });

  it("leaves out notes for the other app (#450)", () => {
    expect(unseenNotes("planner", "2026-10-01", NOTES).map((n) => n.title)).toEqual(["planner-new", "both-mid"]);
  });
});

describe("groupByDate (#450)", () => {
  it("makes one group per day in order (#450)", () => {
    const groups = groupByDate(notesFor("duel", NOTES));
    expect(groups.map((g) => [g.date, g.notes.map((n) => n.title)])).toEqual([
      ["2026-10-08", ["duel-new-a", "duel-new-b"]],
      ["2026-10-05", ["both-mid"]],
      ["2026-10-03", ["duel-old"]],
    ]);
  });
});

describe("last seen storage (#450)", () => {
  it("first run records the newest day and announces nothing, so the next update is the first shown (#450)", () => {
    const storage = memoryStorage();
    expect(loadUnseen("duel", storage, NOTES)).toEqual([]);
    expect(storage.data[lastSeenKey("duel")]).toBe("2026-10-08");
    // The next update lands: only it is announced.
    const next = [...NOTES, note("2026-10-09", "duel", "duel-next")];
    expect(loadUnseen("duel", storage, next).map((n) => n.title)).toEqual(["duel-next"]);
  });

  it("keeps a separate day for each app (#450)", () => {
    const storage = memoryStorage();
    loadUnseen("duel", storage, NOTES);
    expect(readLastSeen("planner", storage)).toBeNull();
    markSeen("planner", "2026-10-05", storage);
    expect(readLastSeen("duel", storage)).toBe("2026-10-08");
    expect(readLastSeen("planner", storage)).toBe("2026-10-05");
  });

  it("never moves the recorded day backwards (#450)", () => {
    const storage = memoryStorage();
    markSeen("duel", "2026-10-08", storage);
    markSeen("duel", "2026-10-05", storage);
    expect(readLastSeen("duel", storage)).toBe("2026-10-08");
  });

  it("treats a garbled stored value like a first run (#450)", () => {
    const storage = memoryStorage({ [lastSeenKey("duel")]: "yesterday" });
    expect(loadUnseen("duel", storage, NOTES)).toEqual([]);
    expect(storage.data[lastSeenKey("duel")]).toBe("2026-10-08");
  });

  it("keeps working when storage throws (#450)", () => {
    const broken: NotesStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readLastSeen("duel", broken)).toBeNull();
    expect(() => markSeen("duel", "2026-10-08", broken)).not.toThrow();
    expect(loadUnseen("duel", broken, NOTES)).toEqual([]);
  });
});

describe("notes.ts data (#450)", () => {
  it("lists days newest first, so a new entry goes at the top (#450)", () => {
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(PATCH_NOTES[i - 1].date >= PATCH_NOTES[i].date, `${PATCH_NOTES[i].title} is newer than the entry above it`).toBe(true);
    }
  });

  it("uses real calendar dates (#450)", () => {
    for (const n of PATCH_NOTES) {
      const d = new Date(`${n.date}T00:00:00Z`);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(n.date) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(n.date), `${n.title}: ${n.date}`).toBe(true);
    }
  });
});
