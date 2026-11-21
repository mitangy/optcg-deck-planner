/** patch-notes mutations (packages/patch-notes/src, vitest): the What's new notes and "seen" bookkeeping shared by the planner + duel-web (#450). */
const helpers = "packages/patch-notes/src/helpers.ts";
const seen = "packages/patch-notes/src/lastSeen.ts";
const notes = "packages/patch-notes/src/notes.ts";
const list = "packages/patch-notes/src/WhatsNewList.tsx";
const noteCards = "packages/patch-notes/src/NoteCards.tsx";
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
    { id: "last-seen-write-throws", file: seen, from: "    storage?.setItem(lastSeenKey(app), date);\n  } catch {\n    // Private mode or blocked storage: the card just comes back next visit.\n  }\n}", to: "    storage?.setItem(lastSeenKey(app), date);\n  } catch (e) {\n    throw e;\n  }\n}", kills: ["keeps working when storage throws"] },
    // the notes themselves
    { id: "notes-entry-out-of-order", file: notes, from: "{ date: \"2026-10-08\", app: \"duel\", pr: 441,", to: "{ date: \"2026-09-01\", app: \"duel\", pr: 441,", kills: ["lists days newest first, so a new entry goes at the top"] },
    { id: "notes-entry-impossible-date", file: notes, from: "{ date: \"2026-10-08\", app: \"both\", pr: 444,", to: "{ date: \"2026-10-32\", app: \"both\", pr: 444,", kills: ["uses real calendar dates"] },
    // cards shown with a note (#1367)
    { id: "note-card-art-typo", file: notes, from: "product/733606_400w.jpg", to: "product/733660_400w.jpg", kills: ["every tagged card uses the catalog art for that id, with the matching alt label (#1367)"] },
    { id: "note-card-thumb-no-open", file: noteCards, from: "onClick={() => setOpen(card)}", to: "onClick={() => undefined}", kills: ["tapping a thumbnail opens the card enlarged (#1367)"] },
    { id: "note-card-page-link-always", file: noteCards, from: "{cardHref ? (\n                <a className=\"wn-zoom-link\" href={cardHref(open.id)}>", to: "{true ? (\n                <a className=\"wn-zoom-link\" href={cardHref?.(open.id) ?? `/cards/${open.id}`}>", kills: ["links to the card page only when the app gives a cardHref (#1367)"] },
    // What's new browsing (#1390)
    { id: "wn-initial-window-too-wide", file: helpers, from: "export const INITIAL_DAYS = 14;", to: "export const INITIAL_DAYS = 60;", kills: ["starts with the newest 14 days, then Show older adds the next days and counts what is left (#1390)"] },
    { id: "wn-initial-window-too-narrow", file: helpers, from: "export const INITIAL_DAYS = 14;", to: "export const INITIAL_DAYS = 7;", kills: ["starts with the newest 14 days, then Show older adds the next days and counts what is left (#1390)"] },
    { id: "wn-initial-min-notes-ignored", file: helpers, from: "export const INITIAL_MIN_NOTES = 20;", to: "export const INITIAL_MIN_NOTES = 1;", kills: ["shows at least 20 notes, whole days only, when the last 14 days are quiet (#1390)"] },
    { id: "wn-initial-min-notes-too-many", file: helpers, from: "export const INITIAL_MIN_NOTES = 20;", to: "export const INITIAL_MIN_NOTES = 40;", kills: ["shows at least 20 notes, whole days only, when the last 14 days are quiet (#1390)"] },
    { id: "wn-older-window-too-wide", file: helpers, from: "export const OLDER_DAYS = 30;", to: "export const OLDER_DAYS = 400;", kills: ["starts with the newest 14 days, then Show older adds the next days and counts what is left (#1390)"] },
    { id: "wn-older-adds-no-day-across-gap", file: helpers, from: "return Math.max(n, shown + 1);", to: "return n;", kills: ["Show older always adds at least one day, even across a long gap (#1390)"] },
    { id: "wn-month-jump-no-reveal", file: list, from: "    setRequested(Math.max(shownCount, groupCountThrough(groups, group.date)));\n", to: "", kills: ["lists the months and a pick reveals that month and scrolls to its first day (#1390)"] },
    { id: "wn-month-jump-no-scroll", file: list, from: "    setJumpTo(group.date);\n", to: "", kills: ["lists the months and a pick reveals that month and scrolls to its first day (#1390)"] },
    { id: "wn-new-read-after-marking-seen", file: list, from: "setUnseen(new Set(loadUnseen(app, undefined, all).map(noteKey)));", to: "markAllSeen(app, undefined, all);\n    setUnseen(new Set(loadUnseen(app, undefined, all).map(noteKey)));", kills: ["marks what is new, says how many, and still counts the visit as seen (#1390)"] },
    { id: "wn-new-range-not-extended", file: list, from: "    if (oldestNew) shownCount = Math.max(shownCount, groupCountThrough(groups, oldestNew.date));\n", to: "", kills: ["new notes are on screen even when they are older than 14 days (#1390)"] },
    { id: "wn-new-first-visit-shows-backlog", file: list, from: "setUnseen(new Set(loadUnseen(app, undefined, all).map(noteKey)));", to: "setUnseen(new Set(all.map(noteKey)));", kills: ["a first visit has no New marks (#1390)"] },
    { id: "wn-topic-event-matches-inside-words", file: helpers, from: "const RANKED_WORDS = /\\b(ranked|tournaments?|bount(y|ies)|leaderboards?|ratings?|events?|seasons?)\\b/i;", to: "const RANKED_WORDS = /(ranked|tournaments?|bount(y|ies)|leaderboards?|ratings?|events?|seasons?)/i;", kills: ["works out topics from the words and lets a note name its own (#1390)"] },
    { id: "wn-topic-override-ignored", file: helpers, from: "  if (note.topics) return [...note.topics];\n", to: "", kills: ["works out topics from the words and lets a note name its own (#1390)"] },
    { id: "wn-topic-cards-field-ignored", file: helpers, from: "note.cards?.length || CARDS_TITLE", to: "CARDS_TITLE", kills: ["works out topics from the words and lets a note name its own (#1390)"] },
    { id: "wn-chip-zero-match-shown", file: list, from: "TOPICS.filter((t) => notes.some((n) => topicsOf.get(n)?.includes(t)))", to: "[...TOPICS]", kills: ["a chip shows every match with a count, and only chips that match something appear (#1390)"] },
    { id: "wn-search-ignores-card-names", file: helpers, from: "...(note.cards ?? []).flatMap((c) => [c.name, c.id])", to: "", kills: ["search matches card names and ids, ignoring case, and says when nothing matches (#1390)"] },
    { id: "wn-search-case-sensitive", file: helpers, from: "hay.some((h) => h.toLowerCase().includes(q))", to: "hay.some((h) => h.includes(q))", kills: ["search matches card names and ids, ignoring case, and says when nothing matches (#1390)"] },
    { id: "wn-filter-paginated", file: list, from: "  } else shownCount = groups.length;", to: "  } else shownCount = Math.min(shownCount, groups.length);", kills: ["a filter shows every match at once, with no Show older (#1390)"] },
    { id: "wn-url-query-not-read", file: list, from: "    setQuery(url.query);\n", to: "", kills: ["a search or topic in the address applies on load (#1390)"] },
    { id: "wn-url-topic-not-read", file: list, from: "    setTopic(url.topic);\n", to: "", kills: ["a search or topic in the address applies on load (#1390)"] },
    { id: "wn-url-not-written", file: list, from: "    writeUrl(nextTopic, nextQuery);\n", to: "", kills: ["a chip shows every match with a count, and only chips that match something appear (#1390)", "search matches card names and ids, ignoring case, and says when nothing matches (#1390)"] },
    { id: "wn-anchor-ignores-title", file: helpers, from: "-${slug(note.title)}`;\n}\n\nexport function monthKey", to: "`;\n}\n\nexport function monthKey", kills: ["every real note has its own anchor within each app's list (#1390)"] },
    { id: "wn-link-target-not-revealed", file: list, from: "    if (targetNote) shownCount = Math.max(shownCount, groupCountThrough(groups, targetNote.date));\n", to: "", kills: ["a link to an old note opens the list far enough, scrolls to it and marks it (#1390)"] },
    { id: "wn-link-target-not-scrolled", file: list, from: "    if (targetNote) document.getElementById(noteAnchor(targetNote))?.scrollIntoView?.({ block: \"start\" });\n", to: "", kills: ["a link to an old note opens the list far enough, scrolls to it and marks it (#1390)"] },
    { id: "wn-copy-link-drops-anchor", file: list, from: "pathname}#${anchor}`", to: "pathname}`", kills: ["Copy link puts the note's address on the clipboard and says so (#1390)"] },
    { id: "wn-copy-link-no-feedback", file: list, from: "    setCopied(true);\n", to: "", kills: ["Copy link puts the note's address on the clipboard and says so (#1390)"] },
    { id: "wn-long-note-limit-too-low", file: list, from: "export const LONG_NOTE_CHARS = 260;", to: "export const LONG_NOTE_CHARS = 100;", kills: ["only notes over the limit fold, and More / Less toggles them (#1390)"] },
    { id: "wn-long-note-never-folds", file: list, from: "export const LONG_NOTE_CHARS = 260;", to: "export const LONG_NOTE_CHARS = 100000;", kills: ["only notes over the limit fold, and More / Less toggles them (#1390)"] },
    { id: "wn-long-note-search-match-stays-folded", file: list, from: "const forced = isTarget || expandedByDefault;", to: "const forced = isTarget;", kills: ["a search match shows the whole note (#1390)"] },
    { id: "wn-long-note-more-not-expanded", file: list, from: "aria-expanded={open}", to: "aria-expanded={false}", kills: ["only notes over the limit fold, and More / Less toggles them (#1390)"] },
  ],
};
