/** patch-notes mutations (packages/patch-notes/src, vitest): the What's new notes and "seen" bookkeeping shared by the planner + duel-web (#450). */
const helpers = "packages/patch-notes/src/helpers.ts";
const seen = "packages/patch-notes/src/lastSeen.ts";
const notes = "packages/patch-notes/src/notes.ts";
module.exports = {
  cwd: "packages/patch-notes",
  runner: "vitest",
  mutations: [
    // which notes an app gets
    { id: "notes-for-other-apps-leak", file: helpers, from: "    .filter((n) => n.app === app || n.app === \"both\")", to: "    .filter(() => true)", kills: ["duel gets its own and shared notes but not planner-only ones"] },
    { id: "notes-for-drops-shared", file: helpers, from: "    .filter((n) => n.app === app || n.app === \"both\")", to: "    .filter((n) => n.app === app)", kills: ["duel gets its own and shared notes but not planner-only ones"] },
    // ordering
    { id: "notes-for-file-order", file: helpers, from: "    .sort((a, b) => (a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i))", to: "    .sort((a, b) => a.i - b.i)", kills: ["lists the newest day first whatever order the file has them in"] },
    { id: "notes-for-oldest-first", file: helpers, from: "(a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i)", to: "(a.n.date < b.n.date ? -1 : a.n.date > b.n.date ? 1 : a.i - b.i)", kills: ["lists the newest day first whatever order the file has them in"] },
    { id: "notes-for-same-day-reversed", file: helpers, from: "a.n.date > b.n.date ? -1 : a.i - b.i))", to: "a.n.date > b.n.date ? -1 : b.i - a.i))", kills: ["lists the newest day first whatever order the file has them in"] },
    { id: "latest-date-is-oldest", file: helpers, from: "return notesFor(app, notes)[0]?.date ?? null;", to: "return notesFor(app, notes).at(-1)?.date ?? null;", kills: ["reports the newest date for the app"] },
    // unseen filtering
    { id: "unseen-includes-last-seen-day", file: helpers, from: "return notesFor(app, notes).filter((n) => n.date > lastSeen);", to: "return notesFor(app, notes).filter((n) => n.date >= lastSeen);", kills: ["returns only notes strictly newer than the last seen day"] },
    { id: "unseen-null-dumps-backlog", file: helpers, from: "  if (lastSeen === null) return [];\n  return notesFor", to: "  if (lastSeen === null) return notesFor(app, notes);\n  return notesFor", kills: ["returns nothing for a visitor with no recorded day"] },
    { id: "group-by-date-never-merges", file: helpers, from: "if (last && last.date === note.date) last.notes.push(note);", to: "if (false) last.notes.push(note);", kills: ["makes one group per day in order"] },
    // last-seen bookkeeping
    { id: "last-seen-first-run-not-recorded", file: seen, from: "    if (latest) markSeen(app, latest, storage);\n    return [];", to: "    return [];", kills: ["first run records the newest day and announces nothing"] },
    { id: "last-seen-first-run-dumps-backlog", file: seen, from: "    if (latest) markSeen(app, latest, storage);\n    return [];", to: "    if (latest) markSeen(app, latest, storage);\n    return unseenNotes(app, \"0000-00-00\", notes);", kills: ["first run records the newest day and announces nothing"] },
    { id: "last-seen-shared-between-apps", file: seen, from: "return `optcg.patchNotes.lastSeen.${app}`;", to: "return \"optcg.patchNotes.lastSeen.duel\";", kills: ["keeps a separate day for each app"] },
    { id: "last-seen-moves-backwards", file: seen, from: "    if (current !== null && current >= date) return;\n", to: "", kills: ["never moves the recorded day backwards"] },
    { id: "last-seen-garbage-accepted", file: seen, from: "return value && DATE.test(value) ? value : null;", to: "return value ? value : null;", kills: ["treats a garbled stored value like a first run"] },
    { id: "last-seen-read-throws", file: seen, from: "  } catch {\n    return null;\n  }\n}\n\n/** Records", to: "  } catch (e) {\n    throw e;\n  }\n}\n\n/** Records", kills: ["keeps working when storage throws"] },
    { id: "last-seen-write-throws", file: seen, from: "  } catch {\n    // Private mode", to: "  } catch (e) {\n    throw e;\n    // Private mode", kills: ["keeps working when storage throws"] },
    // the notes themselves
    { id: "notes-entry-out-of-order", file: notes, from: "{ date: \"2026-10-08\", app: \"duel\", pr: 441,", to: "{ date: \"2026-09-01\", app: \"duel\", pr: 441,", kills: ["lists days newest first, so a new entry goes at the top"] },
    { id: "notes-entry-impossible-date", file: notes, from: "{ date: \"2026-10-08\", app: \"both\", pr: 444,", to: "{ date: \"2026-10-32\", app: \"both\", pr: 444,", kills: ["uses real calendar dates"] },
  ],
};
