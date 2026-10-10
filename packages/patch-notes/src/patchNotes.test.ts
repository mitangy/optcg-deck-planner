import { describe, expect, it } from "vitest";
import { groupByDate, latestNoteDate, notesFor, unseenNotes } from "./helpers";
import { lastSeenKey, loadUnseen, markAllSeen, markSeen, readLastSeen, type NotesStorage } from "./lastSeen";
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

describe("notes added later on a day you already saw (#455)", () => {
  it("announces a note added on the day you last saw, once, and not the ones you already saw (#455)", () => {
    const storage = memoryStorage();
    loadUnseen("duel", storage, NOTES);
    const later = [...NOTES, note("2026-10-08", "duel", "duel-same-day-late")];
    expect(loadUnseen("duel", storage, later).map((n) => n.title)).toEqual(["duel-same-day-late"]);
    // Dismissing records it, so it is not announced again.
    markAllSeen("duel", storage, later);
    expect(loadUnseen("duel", storage, later)).toEqual([]);
    // A third note the same day is announced alone.
    const third = [...later, note("2026-10-08", "both", "both-third")];
    expect(loadUnseen("duel", storage, third).map((n) => n.title)).toEqual(["both-third"]);
  });

  it("keeps the old stored date meaning: that day is seen, later days are not (#455)", () => {
    const storage = memoryStorage({ [lastSeenKey("duel")]: "2026-10-05" });
    expect(loadUnseen("duel", storage, NOTES).map((n) => n.title)).toEqual(["duel-new-a", "duel-new-b"]);
    const legacySameDay = memoryStorage({ [lastSeenKey("duel")]: "2026-10-08" });
    expect(loadUnseen("duel", legacySameDay, NOTES)).toEqual([]);
  });

  it("tells same-day notes apart by pull request, and forgets a past day's keys when a newer day is seen (#455)", () => {
    const storage = memoryStorage();
    const day1: PatchNote[] = [{ ...note("2026-10-08", "duel", "same title"), pr: 1 }];
    markAllSeen("duel", storage, day1);
    const both = [...day1, { ...note("2026-10-08", "duel", "same title"), pr: 2 }];
    expect(loadUnseen("duel", storage, both).map((n) => n.pr)).toEqual([2]);
    markAllSeen("duel", storage, both);
    const nextDay = [...both, note("2026-10-09", "duel", "next")];
    expect(loadUnseen("duel", storage, nextDay).map((n) => n.title)).toEqual(["next"]);
    markAllSeen("duel", storage, nextDay);
    // The 10-08 notes are older than the recorded day, so they are never announced again.
    expect(loadUnseen("duel", storage, nextDay)).toEqual([]);
  });

  it("does not wipe the day's seen notes when an older markAllSeen arrives (#455)", () => {
    const storage = memoryStorage();
    markAllSeen("duel", storage, NOTES);
    markAllSeen("duel", storage, NOTES.filter((n) => n.date < "2026-10-08"));
    const later = [...NOTES, note("2026-10-08", "duel", "duel-same-day-late")];
    expect(loadUnseen("duel", storage, later).map((n) => n.title)).toEqual(["duel-same-day-late"]);
  });

  it("keeps notes already seen that day when a stale tab with fewer notes dismisses (#455)", () => {
    const storage = memoryStorage();
    markAllSeen("duel", storage, NOTES);
    markAllSeen("duel", storage, NOTES.filter((n) => n.title !== "duel-new-b"));
    expect(loadUnseen("duel", storage, NOTES)).toEqual([]);
  });

  it("does not reuse a past day's seen notes after the date moves on without them (#455)", () => {
    const storage = memoryStorage();
    markAllSeen("duel", storage, NOTES);
    markSeen("duel", "2026-10-09", storage);
    const next = [...NOTES, note("2026-10-09", "duel", "duel-next")];
    expect(loadUnseen("duel", storage, next)).toEqual([]);
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
