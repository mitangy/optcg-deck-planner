/**
 * Tool answers as Claude API `search_result` blocks, so the model's claims carry citations the app can show.
 *
 * Every adapter turns one tool's JSON answer into small, self-contained facts (one text block per
 * sentence, line or turn) under a stable machine-readable `source` id the apps parse:
 *   card:<id>                      rule:<section>                  ruling:<card>#<n> | ruling:general#<hash>
 *   stats:<leader>[~<opp>|#<card>] playbook:<leader>[~<opp>]       lesson:<id>
 *   tourney:<leader>[~<opp>|#<card>] (Limitless TCG tournaments)   event:<limitless event id>
 *   match:<match_id>[#t<turn>]     game:<game_id>[#t<turn>]        deck:<hash>        odds:<shape>
 *   sim:<hash>[#curve|#cards|#line]
 * A tool without an adapter (or an answer that can't be adapted) keeps its plain text.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

export type SearchResultBlock = {
  type: "search_result";
  source: string;
  title: string;
  content: { type: "text"; text: string }[];
  citations: { enabled: true };
};
export type TextBlock = { type: "text"; text: string };
export type ToolContent = SearchResultBlock | TextBlock;

/** More than this many sources in one tool answer are cut, with a note. */
const MAX_RESULTS = 60;
const MAX_FACT = 700;

type Fact = string | null | undefined | false;

/** A search result from facts; null when no fact has any text (the API refuses empty text blocks). */
export function searchResult(source: string, title: string, facts: Fact[]): SearchResultBlock | null {
  const content = facts
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((f) => ({ type: "text" as const, text: f.length > MAX_FACT ? `${f.slice(0, MAX_FACT - 1)}…` : f }));
  if (!content.length) return null;
  return { type: "search_result", source, title: title.trim().slice(0, 160) || source, content, citations: { enabled: true } };
}

/** Lines, and sentences of long lines, so a citation points at one fact. */
export function splitFacts(text: string, long = 200): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*]\s+/, "").trim();
    if (!line) continue;
    if (line.length <= long) out.push(line);
    else out.push(...line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“[(])/).map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

/** A short stable hash (FNV-1a, 32 bits, hex) for ids made from a body of text. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const pct = (x: unknown) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "?");
const joined = (xs: unknown) => (Array.isArray(xs) && xs.length ? xs.join(", ") : "");

// ——— cards ———

function cardFacts(c: Rec): Fact[] {
  const stats = [
    c.type,
    joined(c.colors),
    c.cost != null && `cost ${c.cost}`,
    c.power != null && `power ${c.power}`,
    c.counter ? `counter +${c.counter}` : null,
    c.life != null && `life ${c.life}`,
  ].filter(Boolean);
  return [
    `${c.id} ${c.name}: ${stats.join(", ")}.`,
    joined(c.traits) && `Traits: ${joined(c.traits)}.`,
    joined(c.keywords) && `Keywords: ${joined(c.keywords)}.`,
    ...(c.text ? String(c.text).split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (i === 0 ? `Effect: ${l}` : l)) : []),
    c.trigger && `Trigger: ${c.trigger}`,
  ];
}

const cardResult = (c: Rec) => searchResult(`card:${c.id}`, `${c.name} (${c.id})`, cardFacts(c));

function searchCardsAdapter(v: Rec): ToolContent[] {
  const out: ToolContent[] = (v.cards ?? []).map(cardResult).filter(Boolean);
  const shown = (v.cards ?? []).length;
  out.push({ type: "text", text: `Showing ${shown} of ${v.total} matching cards (from offset ${v.offset}).${joined(v.notes) ? ` ${joined(v.notes)}` : ""}` });
  return out;
}

function getCardsAdapter(v: Rec): ToolContent[] {
  const cards: Rec[] = v.cards ?? [];
  const out: ToolContent[] = cards.map(cardResult).filter(Boolean) as ToolContent[];
  const abilities = Object.fromEntries(cards.filter((c) => c.abilities).map((c) => [c.id, c.abilities]));
  if (Object.keys(abilities).length) out.push({ type: "text", text: `Parsed ability structure (for reading card text, not a source): ${JSON.stringify(abilities)}` });
  if (v.missing?.length) out.push({ type: "text", text: `Not found: ${v.missing.join(", ")}` });
  return out;
}

// ——— rules and rulings ———

function rulesAdapter(v: Rec): ToolContent[] {
  const out: ToolContent[] = [];
  for (const s of v.sections ?? []) {
    out.push(
      searchResult(`rule:${s.id}`, s.path || String(s.text).slice(0, 80), [`${s.id} ${s.text}`, ...(s.children ?? []).map((c: Rec) => `${c.id} ${c.text}`)]) as SearchResultBlock,
    );
  }
  for (const q of v.generalQa ?? []) {
    out.push(
      searchResult(`ruling:general#${shortHash(String(q.question))}`, `Rules Q&A${q.category ? `: ${q.category}` : ""}`, [
        `Q: ${q.question}`,
        ...splitFacts(String(q.answer)).map((a, i) => (i === 0 ? `A: ${a}` : a)),
      ]) as SearchResultBlock,
    );
  }
  const note = [v.source?.title && `Source: ${v.source.title}${v.source.version ? ` ${v.source.version}` : ""}${v.source.updated ? `, updated ${v.source.updated}` : ""}.`, ...(v.notes ?? [])].filter(Boolean);
  if (note.length) out.push({ type: "text", text: note.join(" ") });
  return out.filter(Boolean);
}

function cardRulingsAdapter(v: Rec): ToolContent[] {
  const out: (SearchResultBlock | null)[] = [];
  const text: string[] = [];
  for (const c of v.cards ?? []) {
    const who = `${c.name ?? c.id} (${c.id})`;
    if (!c.known) text.push(`${c.id} is not a card in the catalog.`);
    out.push(searchResult(`ruling:${c.id}#ban`, `Ban status: ${who}`, [`${who} ban status: ${c.banStatus}.`]));
    (c.errata ?? []).forEach((e: Rec, k: number) =>
      out.push(searchResult(`ruling:${c.id}#e${k + 1}`, `Errata: ${who}`, [`Errata dated ${e.date} for ${who}.`, `Before: ${e.before}`, `After: ${e.after}`])),
    );
    (c.rulings ?? []).forEach((r: Rec, n: number) =>
      out.push(searchResult(`ruling:${c.id}#${n + 1}`, who, [`Q: ${r.question}`, ...splitFacts(String(r.answer)).map((a, i) => (i === 0 ? `A: ${a}` : a))])),
    );
    if (c.moreRulings) text.push(`${c.moreRulings} more rulings exist for ${c.id}; ask again for specific wording.`);
    (c.mentionedIn ?? []).forEach((r: Rec, k: number) =>
      out.push(
        searchResult(`ruling:${c.id}#m${k + 1}`, `${r.cardName ?? r.cardId} (mentions ${c.id})`, [
          `Q: ${r.question}`,
          ...splitFacts(String(r.answer)).map((a, i) => (i === 0 ? `A: ${a}` : a)),
        ]),
      ),
    );
  }
  const notes = [...text, ...(v.notes ?? [])];
  return [...out.filter((b): b is SearchResultBlock => b !== null), ...(notes.length ? [{ type: "text" as const, text: notes.join(" ") }] : [])];
}

// ——— win rates ———

/** One win record as a sentence; the app reads games and the interval back out of it (see statsDetail in the client). */
export function recordSentence(label: string, r: Rec | null | undefined): string | null {
  if (!r || typeof r.games !== "number") return null;
  if (r.too_few_games) return `${label}: too few games (${r.games}) for a win rate.`;
  const [lo, hi] = r.interval ?? [];
  return `${label}: ${pct(r.win_rate)} win rate, ${r.wins} wins in ${r.games} games (95% interval ${pct(lo)} to ${pct(hi)}).`;
}

function splitFactsFor(split: Rec): Fact[] {
  return [
    recordSentence("Overall", split),
    recordSentence("Going first", split.going_first),
    recordSentence("Going second", split.going_second),
    typeof split.average_turns === "number" && `Average game length: ${split.average_turns} turns.`,
  ];
}

function statsAdapter(v: Rec): ToolContent[] {
  const w = v.source ? `Source: ${v.source}, last ${v.days} days${v.ranked_only ? ", ranked games only" : ""}; not tournament results.` : null;
  const name = (id: string, n?: string | null) => (n ? `${n} (${id})` : id);
  const out: (SearchResultBlock | null)[] = [];
  if (v.leaders) {
    for (const l of v.leaders as Rec[]) {
      out.push(searchResult(`stats:${l.leader}`, `${name(l.leader, l.leader_name)}`, [typeof l.share === "number" && `Play share: ${pct(l.share)} of recorded games.`, ...splitFactsFor(l), w]));
    }
  } else if (v.opponent) {
    const title = `${name(v.leader, v.leader_name)} vs ${name(v.opponent, v.opponent_name)}`;
    out.push(
      searchResult(`stats:${v.leader}~${v.opponent}`, title, [
        v.mirror ? `Mirror match: ${v.games} games; every game is a win and a loss for the same leader, so there is no win rate.` : null,
        ...(v.mirror ? [] : splitFactsFor(v)),
        w,
      ]),
    );
  } else if (v.leader) {
    out.push(searchResult(`stats:${v.leader}`, `${name(v.leader, v.leader_name)}, all opponents`, [...splitFactsFor(v.overall ?? {}), w]));
    for (const o of (v.opponents ?? []) as Rec[]) {
      out.push(searchResult(`stats:${v.leader}~${o.opponent}`, `${name(v.leader, v.leader_name)} vs ${name(o.opponent, o.opponent_name)}`, [...splitFactsFor(o), w]));
    }
    for (const c of (v.cards ?? []) as Rec[]) {
      const label = c.id_name ? `${c.id_name} (${c.id})` : c.id;
      out.push(
        searchResult(`stats:${v.leader}#${c.id}`, `${name(v.leader, v.leader_name)} with and without ${label}`, [
          recordSentence(`With ${label}`, c.with),
          recordSentence(`Without ${label}`, c.without),
          w,
        ]),
      );
    }
  }
  return out.filter((b): b is SearchResultBlock => b !== null);
}

// ——— tournaments (Limitless TCG) ———

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

/** "4xOP01-006, 3xOP01-016": the list as OPTCGSim-style entries, most copies first. */
function decklistText(list: unknown): string {
  if (!list || typeof list !== "object") return "";
  return Object.entries(list as Record<string, number>)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, n]) => `${n}x${id}`)
    .join(", ");
}

/** Tournament results as sources of their own (tourney:, event:), never stats:, so they stay apart from optcgduel.app numbers. */
function tournamentAdapter(v: Rec): ToolContent[] {
  const name = (id: string, n?: string | null) => (n ? `${n} (${id})` : id);
  const w = `Source: Limitless TCG tournament results (play.limitlesstcg.com), last ${v.days} days, events with at least ${v.min_players} players; not games from optcgduel.app.`;
  const withTies = (r: Rec) => (typeof r.ties === "number" && r.ties > 0 ? `Ties not counted as games: ${r.ties}.` : null);
  const out: (SearchResultBlock | null)[] = [];
  const events: Rec[] = v.events ?? [];
  if (v.leaders) {
    const top: Rec[] = v.top_win_rate ?? [];
    out.push(
      searchResult("tourney:meta", "Tournament meta overview", [
        `${v.total_decks} decks and ${v.total_games} finished games from ${events.length} events.`,
        ...top.map((l, i) => recordSentence(`Top win rate ${i + 1}, ${name(l.leader, l.leader_name)} (at least ${v.top_win_rate_min_games} games)`, l)),
        w,
      ]),
    );
    for (const l of v.leaders as Rec[]) {
      out.push(
        searchResult(`tourney:${l.leader}`, `${name(l.leader, l.leader_name)} at tournaments`, [
          typeof l.share === "number" && `Meta share: ${pct(l.share)} of tournament decks (${l.decks} decks).`,
          recordSentence("Tournament record", l),
          withTies(l),
          w,
        ]),
      );
    }
  } else if (v.opponent) {
    const title = `${name(v.leader, v.leader_name)} vs ${name(v.opponent, v.opponent_name)} at tournaments`;
    out.push(
      searchResult(`tourney:${v.leader}~${v.opponent}`, title, [
        v.mirror ? `Mirror match: ${v.games} tournament games; every game is a win and a loss for the same leader, so there is no win rate.` : null,
        ...(v.mirror ? [] : [recordSentence("Tournament record", v), withTies(v)]),
        w,
      ]),
    );
  } else if (v.leader) {
    const label = name(v.leader, v.leader_name);
    const m: Rec = v.meta ?? {};
    out.push(
      searchResult(`tourney:${v.leader}`, `${label} at tournaments`, [
        typeof m.share === "number" && `Meta share: ${pct(m.share)} of tournament decks (${m.decks} of ${m.total_decks} decks in ${events.length} events).`,
        recordSentence("Tournament record against other leaders", v.overall),
        withTies(v.overall ?? {}),
        v.mirror_games > 0 && `Mirror matches: ${v.mirror_games} games, left out of the record.`,
        w,
      ]),
    );
    for (const o of (v.opponents ?? []) as Rec[]) {
      out.push(searchResult(`tourney:${v.leader}~${o.opponent}`, `${label} vs ${name(o.opponent, o.opponent_name)} at tournaments`, [recordSentence("Tournament record", o), withTies(o), w]));
    }
    const rate = (c: Rec) => `Included in ${pct(c.rate)} of ${v.decklists} Limitless decklists (${c.decks} decks), average ${c.average_copies} copies.`;
    for (const c of (v.cards ?? []) as Rec[]) {
      const card = c.id_name ? `${c.id_name} (${c.id})` : c.id;
      out.push(searchResult(`tourney:${v.leader}#${c.id}`, `${label} tournament lists with ${card}`, [rate(c), v.too_few_decks && `Only ${v.decklists} decklists, too few to call this a trend.`, w]));
    }
    const finishes = new Map<string, Rec[]>();
    for (const t of (v.top_placings ?? []) as Rec[]) finishes.set(t.event_id, [...(finishes.get(t.event_id) ?? []), t]);
    for (const [id, list] of finishes) {
      const e = list[0]!;
      const lists = list.flatMap((t) => {
        const r = t.record ?? {};
        const text = decklistText(t.decklist);
        return [`${label} finished ${ordinal(t.placing)} (${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}).`, text && `Decklist: ${text}.`];
      });
      out.push(searchResult(`event:${id}`, `${e.event}, ${e.date}`, [`${e.event}: ${e.date}, ${e.players} players.`, ...lists, w]));
    }
  }
  return out.filter((b): b is SearchResultBlock => b !== null);
}

// ——— playbook ———

function playbookTitle(m: Rec | null | undefined, fallback: string, vs?: string): string {
  const status = m?.status === "draft" || !m?.status ? "Draft" : "Reviewed";
  return `${m?.name ?? fallback}${vs ? ` vs ${vs}` : ""} playbook (${status}, ${m?.format || "unknown set"}${m?.stale ? ", stale" : ""})`;
}

const noteFacts = (heading: string, text: string): string[] => splitFacts(text).map((f) => `${heading}: ${f}`);

function playbookAdapter(v: Rec): ToolContent[] {
  const out: (SearchResultBlock | null)[] = [];
  const notes: string[] = [...(v.notes ?? []).filter((n: unknown) => typeof n === "string")];
  if (v.mentionedIn) {
    for (const m of v.mentionedIn as Rec[]) out.push(searchResult(`playbook:${m.leader}`, playbookTitle(m, m.leader), (m.lines ?? []).flatMap((l: string) => splitFacts(l))));
  } else if (v.opponent !== undefined || v.fromLeaderSide !== undefined || v.leaderGamePlan !== undefined) {
    const lm: Rec | null = v.leader;
    const om: Rec | null = v.opponent;
    if (lm && v.fromLeaderSide) {
      out.push(searchResult(`playbook:${lm.leader}~${om?.leader ?? ""}`.replace(/~$/, ""), playbookTitle(lm, lm.leader, om?.name), [v.fromLeaderSide.heading, ...splitFacts(String(v.fromLeaderSide.text))]));
    }
    if (om && v.fromOpponentSide && lm) {
      out.push(searchResult(`playbook:${om.leader}~${lm.leader}`, playbookTitle(om, om.leader, lm.name), [v.fromOpponentSide.heading, ...splitFacts(String(v.fromOpponentSide.text))]));
    }
    if (lm && v.leaderGamePlan) out.push(searchResult(`playbook:${lm.leader}`, playbookTitle(lm, lm.leader), noteFacts("Game plan", String(v.leaderGamePlan))));
    if (om && v.opponentGamePlan) out.push(searchResult(`playbook:${om.leader}`, playbookTitle(om, om.leader), noteFacts("Game plan", String(v.opponentGamePlan))));
  } else if (v.sections && v.leader) {
    const lm: Rec = v.leader;
    out.push(searchResult(`playbook:${lm.leader}`, playbookTitle(lm, lm.leader), Object.entries(v.sections as Record<string, string>).flatMap(([h, t]) => noteFacts(h, t))));
  }
  const results = out.filter((b): b is SearchResultBlock => b !== null);
  return [...results, ...(notes.length ? [{ type: "text" as const, text: notes.join(" ") }] : [])];
}

/** The playbook index (no leader): the notes list is plain text beside the general principles. */
function playbookIndexAdapter(v: Rec): ToolContent[] {
  if (v.card || v.mentionedIn || v.sections || v.opponent !== undefined || v.fromLeaderSide !== undefined) return playbookAdapter(v);
  if (!Array.isArray(v.notes) || !v.notes.every((n: unknown) => n && typeof n === "object")) return playbookAdapter(v);
  const index = (v.notes as Rec[]).map((n) => `${n.leader} ${n.name} (${n.status}, ${n.format}${n.stale ? ", stale" : ""})`).join("; ");
  const general = v.general ? searchResult("playbook:general", "General playbook principles", Object.entries(v.general as Record<string, string>).flatMap(([h, t]) => noteFacts(h, t))) : null;
  return [...(general ? [general] : []), { type: "text", text: `Leaders with playbook notes (${v.currentFormat} is the newest set): ${index}` }];
}

// ——— lessons ———

function lessonsAdapter(v: Rec): ToolContent[] {
  const lessons: Rec[] = v.lessons ?? [];
  const out = lessons.map((l) =>
    searchResult(`lesson:${l.id}`, `${String(l.text).slice(0, 70)} (${l.status})`, [
      ...splitFacts(String(l.text)),
      (l.leader_id || l.opponent_id) && `Applies to: ${l.leader_id ?? "any leader"}${l.opponent_id ? ` against ${l.opponent_id}` : ""}.`,
      joined(l.cards) && `Cards: ${joined(l.cards)}.`,
      joined(l.match_ids) && `Written from games: ${joined(l.match_ids)}.`,
    ]),
  );
  const results = out.filter((b): b is SearchResultBlock => b !== null);
  return results;
}

// ——— games ———

const TURN_HEADER = /^--- Turn (\d+) \((.*)\) ---$/;

/** A game log cut into its turns: lines before the first turn header (if any) are turn 0. */
export function groupTurns(log: string[]): { turn: number; who: string; lines: string[] }[] {
  const groups: { turn: number; who: string; lines: string[] }[] = [];
  for (const line of log) {
    const m = TURN_HEADER.exec(line);
    if (m) groups.push({ turn: Number(m[1]), who: m[2]!, lines: [] });
    else {
      if (!groups.length) groups.push({ turn: 0, who: "before turn 1", lines: [] });
      groups[groups.length - 1]!.lines.push(line);
    }
  }
  return groups;
}

const listCards = (cards: unknown) => (Array.isArray(cards) ? cards.map((c) => c ?? "a hidden card").join(", ") : "");

/** A narrated game as search results: one overview and one per turn, `<prefix>:<id>` and `<prefix>:<id>#t<n>`. */
export function gameResults(prefix: "match" | "game", id: string, game: Rec): SearchResultBlock[] {
  const mine = prefix === "match";
  const versus = mine ? `${game.yourLeader} vs ${game.opponentLeader}` : `${game.leaders?.A} vs ${game.leaders?.B}`;
  const overview: Fact[] = mine
    ? [
        `Your leader ${game.yourLeader} against ${game.opponentLeader}; you went ${game.wentFirst ? "first" : "second"}.`,
        game.yourOpeningHand && `Your opening hand: ${listCards(game.yourOpeningHand)}.`,
        game.result && `Result: you ${game.result.won ? "won" : "lost"} (${game.result.reason}).`,
        game.finalState && `Final state, turn ${game.finalState.turn}: your life ${game.finalState.yourLife}, opponent life ${game.finalState.opponentLife}; your board: ${listCards(game.finalState.yourBoard) || "empty"}; opponent board: ${listCards(game.finalState.opponentBoard) || "empty"}.`,
      ]
    : [
        `Player A: ${game.leaders?.A}, Player B: ${game.leaders?.B}; Player ${game.wentFirst} went first.`,
        game.openingHands && `Player A opening hand: ${listCards(game.openingHands.A)}. Player B opening hand: ${listCards(game.openingHands.B)}.`,
        game.result && `Result: Player ${game.result.winner} won (${game.result.reason}).`,
        game.finalState && `Final state, turn ${game.finalState.turn}: Player A life ${game.finalState.A?.life}, board ${listCards(game.finalState.A?.board) || "empty"}; Player B life ${game.finalState.B?.life}, board ${listCards(game.finalState.B?.board) || "empty"}.`,
      ];
  const title = versus;
  const out = [searchResult(`${prefix}:${id}`, title, overview)];
  for (const t of groupTurns(Array.isArray(game.log) ? game.log : [])) {
    out.push(searchResult(`${prefix}:${id}#t${t.turn}`, t.turn ? `${versus}, turn ${t.turn} (${t.who})` : `${versus}, ${t.who}`, t.lines));
  }
  return out.filter((b): b is SearchResultBlock => b !== null);
}

function notesBlock(game: Rec): ToolContent[] {
  const notes = [...(game.notes ?? []), ...(game.truncated ? ["The log was cut short."] : [])];
  return notes.length ? [{ type: "text", text: notes.join(" ") }] : [];
}

function reviewAdapter(v: Rec): ToolContent[] {
  return [...gameResults("match", String(v.matchId), v), ...notesBlock(v)];
}

function replayAdapter(v: Rec): ToolContent[] {
  const header = `Game ${v.gameId}${v.date ? ` on ${v.date}` : ""}, ${v.ranked ? "ranked" : "casual"}${v.ratingBands ? `; rating bands A ${v.ratingBands.A ?? "unknown"}, B ${v.ratingBands.B ?? "unknown"}` : ""}.`;
  const results = gameResults("game", String(v.gameId), v);
  if (results[0]) results[0].content.push({ type: "text", text: header });
  return [...results, ...notesBlock(v)];
}

function searchMatchesAdapter(v: Rec): ToolContent[] {
  const side = (s: Rec, label: string) =>
    `Side ${label}: ${s.leader_name ?? s.leader} (${s.leader}), ${s.won ? "won" : "lost"}${s.went_first === true ? ", went first" : s.went_first === false ? ", went second" : ""}${s.rating_band ? `, rating ${s.rating_band}` : ""}.`;
  const out = ((v.games ?? []) as Rec[]).map((g) =>
    searchResult(`game:${g.game_id}`, `${g.A?.leader_name ?? g.A?.leader} vs ${g.B?.leader_name ?? g.B?.leader}${g.date ? ` (${g.date})` : ""}`, [
      side(g.A, "A"),
      side(g.B, "B"),
      `${g.ranked ? "Ranked" : "Casual"} game${g.turns ? `, ${g.turns} turns` : ""}${g.date ? `, played ${g.date}` : ""}.`,
    ]),
  );
  return [
    ...out.filter((b): b is SearchResultBlock => b !== null),
    { type: "text", text: `${v.total} games match (showing from offset ${v.offset}, last ${v.window_days} days). Read one with replay_match and its game_id.` },
  ];
}

// ——— deck check and odds ———

const nameCounts = (xs: unknown, top = 8) => (Array.isArray(xs) ? xs.slice(0, top).map((x: Rec) => `${x.name} ${x.count}`).join(", ") : "");

/** The id of a deck check: a hash of the leader and the sorted card list, so the same deck always cites the same source. */
export function deckSourceId(leaderId: string | undefined, cards: { id: string; copies: number }[]): string {
  const body = [leaderId ?? "", ...cards.map((c) => `${c.id}x${c.copies}`).sort()].join("|");
  return `deck:${shortHash(body)}`;
}

function analyzeDeckAdapter(v: Rec): ToolContent[] {
  const d = v.deck ?? {};
  const s = v.stats ?? {};
  const bans: Rec[] = v.banList?.problems ?? [];
  const facts: Fact[] = [
    `${d.name || "This deck"}: leader ${d.leader ? `${d.leader.name} (${d.leader.id})` : "missing"}, ${d.mainDeckCount} main deck cards. ${v.legal ? "Legal." : "Not legal."}`,
    ...(d.warnings ?? []).map((w: string) => `Warning: ${w}`),
    ...(v.hints ?? []).map((h: Rec) => `${h.tier}: ${h.title}. ${h.detail ?? ""}`),
    ...bans.map((p) => `Ban list: ${p.problem}`),
    ...(v.banList?.upcoming ?? []).map((p: Rec) => `Ban list from ${p.effective}: ${p.problem}`),
    Array.isArray(s.costCurve) && s.costCurve.length && `Cost curve: ${s.costCurve.map((b: Rec) => `cost ${b.cost}: ${b.total}`).join(", ")}.`,
    s.counter && `Counter: ${s.counter.none} cards with none, ${s.counter.c1000} with +1000, ${s.counter.c2000} with +2000, ${s.counter.events} counter events; average ${s.counter.average} per card.`,
    s.openingHand && `Opening hand of ${s.openingHand.size}: expect ${s.openingHand.expectedCounter} counter cards and ${s.openingHand.expectedTriggers} triggers.`,
    nameCounts(s.roles) && `Roles: ${nameCounts(s.roles)}.`,
    nameCounts(s.keywords) && `Keywords: ${nameCounts(s.keywords)}.`,
    nameCounts(s.traits) && `Top traits: ${nameCounts(s.traits)}.`,
    ...(v.searchers ?? []).map((r: Rec) => `${r.name} looks at ${r.look}: ${r.chance === null ? "hit chance unknown" : `${r.chance}% to find a hit (${r.hits} left in the deck)`}.`),
    ...(v.notImplemented ?? []).map((c: Rec) => `${c.name} (${c.id}) is ${c.support} in the duel engine.`),
  ];
  const id = deckSourceId(d.leader?.id, d.cards ?? []);
  const result = searchResult(id, d.name || d.leader?.name || "Deck", facts);
  return result ? [result, ...(v.notes?.length ? [{ type: "text" as const, text: v.notes.join(" ") }] : [])] : [];
}

/** A suggested deck edit as one source: the app shows it as an Apply card, so the model is told nothing has changed. */
function proposalAdapter(v: Rec): ToolContent[] {
  const lines: Rec[] = Array.isArray(v.lines) ? v.lines : [];
  const legality: Rec = v.legality ?? {};
  const problems: string[] = Array.isArray(legality.problems) ? legality.problems : [];
  const after = new Map<string, number>((Array.isArray(v.base) ? v.base : []).map((c: Rec) => [String(c.id), Number(c.copies)]));
  for (const l of lines) after.set(String(l.id), Number(l.after));
  const afterCards = [...after].filter(([, n]) => n > 0).map(([id, copies]) => ({ id, copies }));
  const facts: Fact[] = [
    "Shown to the player as an Apply card; nothing has changed yet.",
    ...lines.map((l) => {
      const delta = Number(l.after) - Number(l.before);
      return `${delta > 0 ? "+" : "-"}${Math.abs(delta)} ${l.name} (${l.id}): ${l.reason}`;
    }),
    legality.legal ? `After the change: ${legality.count} cards, legal.` : `After the change: ${legality.count} cards. Still not legal: ${problems.join("; ")}.`,
    ...(Array.isArray(legality.upcoming) ? legality.upcoming : []).map((u: string) => `Ban list: ${u}`),
    legality.ban_list_checked === false && "The ban list couldn't be checked.",
  ];
  const result = searchResult(deckSourceId(v.target?.leader_id ?? undefined, afterCards), `Suggested edit: ${v.target?.name ?? "deck"}`, facts);
  return result ? [result] : [];
}

function oddsAdapter(v: Rec): ToolContent[] {
  if (!Array.isArray(v.byTurn)) return [];
  const order = v.goingFirst ? "going first" : "going second";
  const shape = `d${v.deckSize}h${v.hits}x${v.atLeast}${v.goingFirst ? "f" : "s"}${v.mulligan ? "m" : ""}`;
  const facts = [
    `Deck of ${v.deckSize} cards with ${v.hits} hits, ${order}${v.mulligan ? ", mulligan a hand with no hit" : ", no mulligan"}: chance of at least ${v.atLeast} by each turn.`,
    ...v.byTurn.map((t: Rec) => `By turn ${t.turn}: ${t.percent}% to have seen at least ${v.atLeast} (${order}).`),
  ];
  const result = searchResult(`odds:${shape}`, `${v.hits} hits in ${v.deckSize} cards, at least ${v.atLeast}, ${order}`, facts);
  return result ? [result, ...(v.notes?.length ? [{ type: "text" as const, text: v.notes.join(" ") }] : [])] : [];
}

// ——— goldfish simulation ———

const pct1 = (x: unknown) => (typeof x === "number" ? x.toFixed(1) : "?");

/** The engine-support facts of a simulation, kept next to every speed number in its main source. */
function simSupportFacts(v: Rec): Fact[] {
  const s = v.support ?? {};
  const runs = v.setup?.runs;
  const flagged: Rec[] = s.flagged ?? [];
  return [
    flagged.length
      ? `Engine support incomplete: ${flagged.map((f) => `${f.name} (${f.id}, ${f.support})`).join(", ")} ${flagged.length === 1 ? "is" : "are"} not fully supported; ${s.runsAffected} of ${runs} games played or used one of them, so treat those games as approximate.`
      : "Every card in this deck is fully supported by the duel engine.",
    v.errors?.runs > 0 && `${v.errors.runs} games stopped on an engine error and count as no win.`,
  ];
}

function simulateAdapter(v: Rec): ToolContent[] {
  const st = v.setup;
  if (typeof v.sourceId !== "string" || !st || !Array.isArray(v.lethal?.byTurn)) return [];
  const id: string = v.sourceId;
  const name = v.deck?.name || v.deck?.leader?.name || "Deck";
  const order = st.goingFirst ? "going first" : "going second";
  const lethal = v.lethal;
  const main = searchResult(id, `Goldfish: ${name}, ${order}, dummy at ${st.opponent.life} Life`, [
    `Setup: ${st.runs} scripted solitaire games of ${name} (${v.deck?.leader?.id}) ${order}, against a dummy at ${st.opponent.life} Life and ${st.opponent.power} power that never blocks, counters or attacks, through your turn ${st.turns}.`,
    st.truncated && `Stopped after ${st.runs} of ${st.runsRequested} requested games to stay within the time limit.`,
    ...lethal.byTurn
      .filter((t: Rec) => t.turn >= 2)
      .map((t: Rec) => `Won by your turn ${t.turn} in ${t.wins} of ${st.runs} games (${pct1(t.percent)}%, 95% interval ${pct1(t.interval?.[0])}% to ${pct1(t.interval?.[1])}%).`),
    lethal.wins > 0
      ? `Fastest win: your turn ${lethal.fastestWinTurn}; median win turn ${lethal.medianWinTurn} among the ${lethal.wins} wins.`
      : `No win by your turn ${st.turns} in any of ${st.runs} games.`,
    ...simSupportFacts(v),
  ]);

  const hand = v.openingHand ?? {};
  const rule = st.mulligan === "never" ? "never mulligan" : st.keepCards?.length ? `mulligan a hand with none of ${joined(st.keepCards.map((c: Rec) => c.name))}` : "mulligan a hand with no Character costing 3 or less";
  const curve = searchResult(`${id}#curve`, `Goldfish curve: ${name}`, [
    `Mulliganed ${pct1(hand.mulliganPercent)}% of opening hands (${rule}).`,
    typeof hand.keepCardPercent === "number" && `The kept hand held ${joined(st.keepCards?.map((c: Rec) => c.name))} in ${pct1(hand.keepCardPercent)}% of games.`,
    ...(v.curve ?? [])
      .filter((c: Rec) => c.runs > 0)
      .map(
        (c: Rec) =>
          `Your turn ${c.turn}: ${c.avgDon} DON!!, all of it spent on plays in ${c.allDonUsedPercent}% of games (average ${c.avgSpent} spent); average ${c.avgCharacters} Characters on board, dummy at ${c.avgOpponentLife} Life.${c.runs < st.runs ? ` (over the ${c.runs} games still going)` : ""}`,
      ),
  ]);

  const cards = searchResult(
    `${id}#cards`,
    `Goldfish card timing: ${name}`,
    (v.cards ?? []).map((c: Rec) => `${c.name} (${c.id}) first played by your turn ${c.byTurn.map((t: Rec, i: number) => `${i === 0 ? "" : "turn "}${t.turn} in ${pct1(t.percent)}%`).join(", ")}`),
  );

  const ex = v.example;
  const line = ex
    ? searchResult(`${id}#line`, `Example: fastest win (seed ${ex.seed})`, [
        ...(ex.turns ?? []).map(
          (t: Rec) =>
            `Your turn ${t.turn} (${t.line}): played ${joined(t.played) || "nothing"}; attached ${t.donGiven} DON!!; ${t.attacks} attacks, ${t.hits} hits; dummy at ${t.opponentLife} Life.`,
        ),
        `Won on your turn ${ex.winTurn}.`,
      ])
    : null;

  const results = [main, curve, cards, line].filter((r): r is SearchResultBlock => r !== null);
  return [...results, ...(v.notes?.length ? [{ type: "text" as const, text: v.notes.join(" ") }] : [])];
}

const ADAPTERS: Record<string, (v: Rec) => ToolContent[]> = {
  search_cards: searchCardsAdapter,
  get_cards: getCardsAdapter,
  rules_lookup: rulesAdapter,
  card_rulings: cardRulingsAdapter,
  matchup_stats: statsAdapter,
  tournament_stats: tournamentAdapter,
  playbook: playbookIndexAdapter,
  my_lessons: lessonsAdapter,
  review_match: reviewAdapter,
  replay_match: replayAdapter,
  search_matches: searchMatchesAdapter,
  analyze_deck: analyzeDeckAdapter,
  draw_odds: oddsAdapter,
  propose_deck_edit: proposalAdapter,
  simulate: simulateAdapter,
};

/**
 * One tool's plain answer as tool_result content with citable search results, or null to keep the plain
 * text (no adapter, not JSON, or nothing citable in it).
 */
export function adaptToolResult(tool: string, text: string): ToolContent[] | null {
  const adapter = ADAPTERS[tool];
  if (!adapter) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  try {
    const blocks = adapter(value as Rec);
    const results = blocks.filter((b): b is SearchResultBlock => b.type === "search_result");
    if (!results.length) return null;
    const notes = blocks.filter((b): b is TextBlock => b.type === "text").map((b) => b.text);
    if (results.length > MAX_RESULTS) notes.push(`${results.length - MAX_RESULTS} more results were left out; narrow the question to see them.`);
    // The API refuses a tool result that mixes search results with plain text, so the notes become one source of their own.
    const note = notes.length ? searchResult(`note:${tool}`, "Lookup notes", notes) : null;
    return [...results.slice(0, MAX_RESULTS), ...(note ? [note] : [])];
  } catch {
    return null;
  }
}
