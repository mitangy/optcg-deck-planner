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
    { id: "unseen-includes-last-seen-day", file: helpers, from: "n.date > lastSeen || (", to: "n.date >= lastSeen || (", kills: ["returns only notes strictly newer than the last seen day"] },
    { id: "unseen-null-dumps-backlog", file: helpers, from: "  if (lastSeen === null) return [];\n  return notesFor", to: "  if (lastSeen === null) return notesFor(app, notes);\n  return notesFor", kills: ["returns nothing for a visitor with no recorded day"] },
    { id: "unseen-same-day-ignores-keys", file: helpers, from: "(n.date === lastSeen && seenOnLastDay !== null && !seenOnLastDay.includes(noteKey(n)))", to: "false", kills: ["announces a note added on the day you last saw, once, and not the ones you already saw (#455)", "tells same-day notes apart by pull request, and forgets a past day's keys when a newer day is seen (#455)"] },
    { id: "unseen-legacy-date-dumps-day", file: helpers, from: "seenOnLastDay !== null && !seenOnLastDay.includes(noteKey(n))", to: "!(seenOnLastDay ?? []).includes(noteKey(n))", kills: ["keeps the old stored date meaning: that day is seen, later days are not (#455)"] },
    { id: "note-key-title-only", file: helpers, from: "return n.pr !== undefined ? `pr${n.pr}` : `${n.date}|${n.title}`;", to: "return `${n.date}|${n.title}`;", kills: ["tells same-day notes apart by pull request, and forgets a past day's keys when a newer day is seen (#455)"] },
    { id: "group-by-date-never-merges", file: helpers, from: "if (last && last.date === note.date) last.notes.push(note);", to: "if (false) last.notes.push(note);", kills: ["makes one group per day in order"] },
    // last-seen bookkeeping
    { id: "last-seen-first-run-not-recorded", file: seen, from: "    markAllSeen(app, storage, notes);\n    return [];", to: "    return [];", kills: ["first run records the newest day and announces nothing"] },
    { id: "last-seen-first-run-dumps-backlog", file: seen, from: "    markAllSeen(app, storage, notes);\n    return [];", to: "    markAllSeen(app, storage, notes);\n    return unseenNotes(app, \"0000-00-00\", notes);", kills: ["first run records the newest day and announces nothing"] },
    { id: "last-seen-keys-not-recorded", file: seen, from: "    storage?.setItem(seenKeysKey(app), JSON.stringify({ date: latest, keys: [...keys] }));", to: "", kills: ["announces a note added on the day you last saw, once, and not the ones you already saw (#455)", "tells same-day notes apart by pull request, and forgets a past day's keys when a newer day is seen (#455)"] },
    { id: "last-seen-keys-ignore-day", file: seen, from: "if (parsed.date !== lastSeen || !Array.isArray(parsed.keys)) return null;", to: "if (!Array.isArray(parsed.keys)) return null;", kills: ["does not reuse a past day's seen notes after the date moves on without them (#455)"] },
    { id: "last-seen-keys-replaced-not-merged", file: seen, from: "const keys = new Set(readSeenOnLastDay(app, storage) ?? []);", to: "const keys = new Set<string>();", kills: ["keeps notes already seen that day when a stale tab with fewer notes dismisses (#455)"] },
    { id: "last-seen-older-mark-overwrites-keys", file: seen, from: "    if (readLastSeen(app, storage) !== latest) return;\n", to: "", kills: ["does not wipe the day's seen notes when an older markAllSeen arrives (#455)"] },
    { id: "last-seen-shared-between-apps", file: seen, from: "return `optcg.patchNotes.lastSeen.${app}`;", to: "return \"optcg.patchNotes.lastSeen.duel\";", kills: ["keeps a separate day for each app"] },
    { id: "last-seen-moves-backwards", file: seen, from: "    if (current !== null && current >= date) return;\n", to: "", kills: ["never moves the recorded day backwards"] },
    { id: "last-seen-garbage-accepted", file: seen, from: "return value && DATE.test(value) ? value : null;", to: "return value ? value : null;", kills: ["treats a garbled stored value like a first run"] },
    { id: "last-seen-read-throws", file: seen, from: "  } catch {\n    return null;\n  }\n}\n\nexport function seenKeysKey", to: "  } catch (e) {\n    throw e;\n  }\n}\n\nexport function seenKeysKey", kills: ["keeps working when storage throws"] },
    { id: "last-seen-write-throws", file: seen, from: "  } catch {\n    // Private mode or blocked storage: the card just comes back next visit.\n  }\n}\n\n/**\n * The notes", to: "  } catch (e) {\n    throw e;\n  }\n}\n\n/**\n * The notes", kills: ["keeps working when storage throws"] },
    // the notes themselves
    { id: "notes-entry-out-of-order", file: notes, from: "{ date: \"2026-10-08\", app: \"duel\", pr: 441,", to: "{ date: \"2026-09-01\", app: \"duel\", pr: 441,", kills: ["lists days newest first, so a new entry goes at the top"] },
    { id: "notes-entry-impossible-date", file: notes, from: "{ date: \"2026-10-08\", app: \"both\", pr: 444,", to: "{ date: \"2026-10-32\", app: \"both\", pr: 444,", kills: ["uses real calendar dates"] },
  ],
};
