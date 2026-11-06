/**
 * OPTCGSim combat-log reader (issue #1030, step 1). Pure: no I/O, never throws on odd lines.
 *
 * The log has two interleaved tracks: human text lines and the machine track (`RZ1|...`).
 * Zone moves from the machine track rebuild both boards exactly; every `RZ1|CHK` line is
 * compared with the rebuilt zone counts. Text lines supply events (attacks, blocks, effects)
 * and the few state changes the machine track does not log (rest from attacking, refresh).
 */
import type {
  SimBoardSnapshot,
  SimCardCount,
  SimChkMismatch,
  SimEvent,
  SimGame,
  SimMatchRecord,
  SimParseReport,
  SimPlayer,
  SimSide,
  SimSnapshot,
  SimTurn,
} from "./types.js";

const ZW = /[\u200b\u200c\u200d\ufeff]/g;
export const normalizeSimName = (s: string | null | undefined): string => (s ?? "").replace(ZW, "").trim();

const other = (s: SimSide): SimSide => (s === "me" ? "opp" : "me");

/** `"4xOP17-040"` -> `{ id: "OP17-040", count: 4 }`; a bare id counts once. */
export function parseCardCounts(list: readonly string[] | undefined | null): SimCardCount[] {
  const out: SimCardCount[] = [];
  for (const raw of list ?? []) {
    const m = /^(\d+)x(.+)$/.exec(String(raw).trim());
    if (m) out.push({ id: m[2], count: Number(m[1]) });
    else if (String(raw).trim()) out.push({ id: String(raw).trim(), count: 1 });
  }
  return out;
}

/** Turn `<mark><link="ID">ID</link></mark>` into `ID` (brackets stay) and drop other tags. */
export function cleanSimText(line: string): string {
  return line
    .replace(/<mark><link="([^"]*)">[^<]*<\/link><\/mark>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(ZW, "")
    .trim();
}

// ---------------------------------------------------------------- board model

interface Char {
  id: string;
  rested: boolean;
  power: number;
  attached: number;
}

/**
 * Slots are positions in an ordered list per zone: inserting at `newSlot` shifts later entries up and
 * removing shifts them down (verified: DON!! drawn rested lands at slot 0 while another sits there).
 */
interface Board {
  deck: number;
  donDeck: number;
  life: number;
  hand: { id: string; seen: boolean }[];
  chars: Char[];
  stage: string[];
  trash: string[];
  donField: boolean[]; // rested flag per DON!! in the cost area
  leaderAttached: number;
  /** DON!! still attached to a character that already left; returned by a later 9>5 move. */
  orphanAttached: Map<number, number>;
  leaderId: string | null;
  leaderRested: boolean;
}

const newBoard = (leaderId: string | null): Board => ({
  deck: 50,
  donDeck: 10,
  life: 0,
  hand: [],
  chars: [],
  stage: [],
  trash: [],
  donField: [],
  leaderAttached: 0,
  orphanAttached: new Map(),
  leaderId,
  leaderRested: false,
});

const attachedTotal = (b: Board): number => {
  let n = b.leaderAttached;
  for (const c of b.chars) n += c.attached;
  for (const v of b.orphanAttached.values()) n += v;
  return n;
};

function snapshotBoard(b: Board, side: SimSide): SimBoardSnapshot {
  const donRested = b.donField.filter(Boolean).length;
  return {
    leader: { id: b.leaderId, attachedDon: b.leaderAttached, rested: b.leaderRested },
    characters: b.chars.map((ch, slot) => ({
      slot,
      id: ch.id,
      rested: ch.rested,
      powerDelta: ch.power,
      attachedDon: ch.attached,
    })),
    stage: b.stage[0] ?? null,
    lifeCount: b.life,
    handCount: b.hand.length,
    knownHandIds: b.hand.filter((h) => side === "me" || h.seen).map((h) => h.id),
    donActive: b.donField.length - donRested,
    donRested,
    donDeckCount: b.donDeck,
    deckCount: b.deck,
    trashIds: [...b.trash],
  };
}

function refresh(b: Board): void {
  b.donField = b.donField.map(() => false);
  for (const c of b.chars) c.rested = false;
  b.leaderRested = false;
}

/** Remove from an ordered list at `slot`; when the entry there is not `id`, fall back to the first `id` match. */
function takeAt<T>(list: T[], slot: number, match: (t: T) => boolean): T | undefined {
  let i = slot >= 0 && slot < list.length && match(list[slot]) ? slot : list.findIndex(match);
  if (i < 0 && slot >= 0 && slot < list.length) i = slot;
  return i >= 0 ? list.splice(i, 1)[0] : undefined;
}
const insertAt = <T>(list: T[], slot: number, v: T): void => {
  list.splice(Math.max(0, Math.min(slot, list.length)), 0, v);
};

function removeCard(b: Board, zone: number, slot: number, id: string): Char | undefined {
  switch (zone) {
    case 0:
      b.deck--;
      break;
    case 1: {
      let i = b.hand.findIndex((h) => h.id === id);
      if (i < 0 && b.hand.length) i = 0;
      if (i >= 0) b.hand.splice(i, 1);
      break;
    }
    case 2: {
      const ch = takeAt(b.chars, slot, (c) => c.id === id);
      if (ch && ch.attached > 0) b.orphanAttached.set(slot, (b.orphanAttached.get(slot) ?? 0) + ch.attached);
      return ch;
    }
    case 3:
      b.life--;
      break;
    case 6: {
      const i = b.trash.lastIndexOf(id);
      if (i >= 0) b.trash.splice(i, 1);
      else b.trash.pop();
      break;
    }
    case 7:
      takeAt(b.stage, slot, (c) => c === id);
      break;
    default:
      break;
  }
  return undefined;
}

function addCard(b: Board, zone: number, slot: number, id: string, rested: boolean, power: number, seen: boolean, keep?: Char): void {
  switch (zone) {
    case 0:
      b.deck++;
      break;
    case 1:
      b.hand.push({ id, seen });
      break;
    case 2:
      insertAt(b.chars, slot, { id, rested, power, attached: keep?.attached ?? 0 });
      break;
    case 3:
      b.life++;
      break;
    case 6:
      b.trash.push(id);
      break;
    case 7:
      insertAt(b.stage, slot, id);
      break;
    default:
      break;
  }
}

function removeDon(b: Board, zone: number, slot: number): void {
  if (zone === 4) b.donDeck--;
  else if (zone === 5) {
    if (slot >= 0 && slot < b.donField.length) b.donField.splice(slot, 1);
    else b.donField.pop();
  } else if (zone === 9) {
    const parent = Math.floor(slot / 100);
    if (parent === 99) b.leaderAttached = Math.max(0, b.leaderAttached - 1);
    else if (b.chars[parent]?.attached) b.chars[parent].attached--;
    else if (b.orphanAttached.get(parent)) b.orphanAttached.set(parent, (b.orphanAttached.get(parent) ?? 1) - 1);
    else {
      const c = b.chars.find((x) => x.attached > 0);
      if (c) c.attached--;
    }
  }
}

function addDon(b: Board, zone: number, slot: number, rested: boolean): void {
  if (zone === 4) b.donDeck++;
  else if (zone === 5) insertAt(b.donField, slot, rested);
  else if (zone === 9) {
    const parent = Math.floor(slot / 100);
    if (parent === 99) b.leaderAttached++;
    else if (b.chars[parent]) b.chars[parent].attached++;
    else b.orphanAttached.set(parent, (b.orphanAttached.get(parent) ?? 0) + 1);
  }
}

// ---------------------------------------------------------------- text patterns

const ID = "([^\\[\\]\\s]+)";
const RE = {
  prefix: /^\[([^\]]+)\]\s*(.*)$/,
  leader: new RegExp(`^Leader is (.+?) \\[${ID}\\]$`),
  chose: /^Chose to go (First|Second)$/,
  draw: /^Draw (\d+) Cards?$/,
  drawDon: /^Draw (\d+) Don$/,
  deploy: new RegExp(`^Deploy (.+?) \\[${ID}\\]$`),
  attach: new RegExp(`^Attach (\\d+) Don to (.+?) \\[${ID}\\] \\((\\d+) Total\\)$`),
  attack: new RegExp(`^(.+?) \\[${ID}\\] attacking (.+?) \\[${ID}\\]$`),
  block: new RegExp(`^(.+?) \\[${ID}\\] Blocks$`),
  counterDiscard: new RegExp(`^Discard (.+?) \\[${ID}\\] for Counter (\\d+)$`),
  destroyed: new RegExp(`^(.+?) \\[${ID}\\] Destroyed$`),
  battle: new RegExp(`^(.+?) \\[${ID}\\]\\[(-?\\d+)\\] vs (.+?) \\[${ID}\\]\\[(-?\\d+)\\]$`),
  hit: new RegExp(`^(.+?) \\[${ID}\\] hit for (\\d+) damage$`),
  effect: new RegExp(`^(.+?) \\[${ID}\\]: (.*)$`),
  restSelf: new RegExp(`^Rest .+? \\[${ID}\\]$`),
  setActive: new RegExp(`^Set .+? \\[${ID}\\] to Active$`),
  counterEffect: /^(?:Activate Counter|Counter (\d+))$/,
};

const META: RegExp[] = [
  /^Attempting to connect/,
  /^Version is /,
  /^Connected to Server/,
  /^Setting up a Relay Room/,
  /^Network Transport Failure/,
  /^Opponent is Ready for Rematch/,
  /^Opponent Has Disconnected!/,
  /Has Connected$/,
  /^Will select turn order$/,
  /^Waiting for a Connection/,
];

const INFO: RegExp[] = [
  /^Placing Cards on (Top|Bottom) of Deck$/,
  /^Forcing opponent to resolve Card Action!$/,
  /^Banished \d+ Life$/,
  /^Sent a Card to Deck (Top|Bottom)$/,
  /no longer nullified$/,
  /is no longer blocked from attacking$/,
  / Gains [A-Za-z ]+$/,
  / cost restored$/,
  /^Picked no cards to Draw$/,
  /^Can't /,
  /^Characters can survive KO/,
  / revealed: /,
  /^Draw .+ from Trash$/,
  /^Trash .+ from Life$/,
  new RegExp(`^Trash .+? \\[${ID}\\]$`),
];

const RESULTS: [RegExp, Extract<SimEvent, { kind: "result" }>["what"]][] = [
  [/^Wins!$/, "wins"],
  [/^Loses$/, "loses"],
  [/^Concedes!$/, "concedes"],
  [/^Quits!$/, "quits"],
  [/^The game ended due to a turn timeout!$/, "timeout"],
];

// ---------------------------------------------------------------- parser

interface TurnBuild {
  turn: SimTurn;
  pending: boolean; // snapshot not taken yet
}

const ZONE_NAME: Record<number, "hand" | "character" | "stage" | "life" | "deck" | "other"> = {
  0: "deck",
  1: "hand",
  2: "character",
  3: "life",
  7: "stage",
};

export function parseSimGame(match: SimMatchRecord): SimGame {
  const meName = normalizeSimName(match.playerName);
  const log = typeof match.combatLog === "string" ? match.combatLog : "";
  const lines = log.split(/\r?\n/);

  // Pre-scan: header, PLY lines, order choice.
  const plyByOwner = new Map<number, { name: string; leader: string }>();
  let simVersion: string | null = null;
  let chose: { name: string; first: boolean } | null = null;
  for (const raw of lines) {
    if (raw.startsWith("RZ1|HDR|")) simVersion = raw.split("|")[2] ?? null;
    else if (raw.startsWith("RZ1|PLY|")) {
      const p = raw.split("|");
      plyByOwner.set(Number(p[2]), { name: normalizeSimName(p[3]), leader: p[4] ?? "" });
    } else if (!chose) {
      const m = /^\[([^\]]+)\]\s*Chose to go (First|Second)$/.exec(normalizeSimName(raw));
      if (m) chose = { name: normalizeSimName(m[1]), first: m[2] === "First" };
    }
  }
  let oppName = normalizeSimName(match.oppPlayerName);
  if (!oppName) for (const v of plyByOwner.values()) if (v.name !== meName) oppName = v.name;

  const sideOfName = (n: string): SimSide | null => {
    const name = normalizeSimName(n);
    if (name === meName) return "me";
    if (oppName && name === oppName) return "opp";
    return null;
  };
  const ownerSide = new Map<number, SimSide>();
  for (const [owner, v] of plyByOwner) {
    const s = sideOfName(v.name);
    if (s) ownerSide.set(owner, s);
  }
  // A PLY line can be stale (rematch tail) or missing: when only one owner number maps to a side,
  // the other owner number belongs to the other side.
  if (ownerSide.size === 1) {
    const [[o, s]] = [...ownerSide];
    ownerSide.set(o === 1 ? 2 : 1, other(s));
  } else if (ownerSide.size === 0 && plyByOwner.size === 1) {
    const [o] = [...plyByOwner.keys()];
    ownerSide.set(o, "opp");
    ownerSide.set(o === 1 ? 2 : 1, "me");
  }
  const ownerOf = (s: SimSide): 1 | 2 | null => {
    for (const [o, side] of ownerSide) if (side === s && (o === 1 || o === 2)) return o;
    return null;
  };
  // Machine lines before the first connection chatter are the tail of the previous (rematched) game.
  const CONNECT = /^(Opponent Has Disconnected!|Setting up a Relay Room|Attempting to connect|Version is|Waiting for a Connection)/;
  let boundary = lines.findIndex((l) => CONNECT.test(l));
  if (boundary < 0) boundary = 0;

  let firstPlayer: SimSide;
  if (chose) {
    const s = sideOfName(chose.name);
    firstPlayer = s ? (chose.first ? s : other(s)) : match.turnOrder === 1 ? "opp" : "me";
  } else firstPlayer = match.turnOrder === 1 ? "opp" : "me";

  const leaderOf = (s: SimSide): string | null => {
    const o = ownerOf(s);
    const fromPly = o ? plyByOwner.get(o)?.leader : undefined;
    const fromRec = s === "me" ? match.playerLeader : match.oppLeader;
    return fromRec || fromPly || null;
  };
  const mkPlayer = (s: SimSide): SimPlayer => ({
    side: s,
    name: s === "me" ? meName : oppName,
    owner: ownerOf(s),
    leaderId: leaderOf(s),
    leaderName: (s === "me" ? match.playerLeaderName : match.oppLeaderName) ?? null,
    decklist: parseCardCounts(s === "me" ? match.decklist : match.oppDecklist),
    startingHand: parseCardCounts(s === "me" ? match.startingHand : match.oppStartingHand),
    mulligan: false,
  });
  const players = { me: mkPlayer("me"), opp: mkPlayer("opp") };
  const boards: Record<SimSide, Board> = { me: newBoard(players.me.leaderId), opp: newBoard(players.opp.leaderId) };

  const preEvents: SimEvent[] = [];
  const turns: TurnBuild[] = [];
  const unknownLines: string[] = [];
  const chkMismatches: SimChkMismatch[] = [];
  let chkChecked = 0;
  let cur: TurnBuild | null = null;
  let active: SimSide = firstPlayer;

  const push = (e: SimEvent): void => {
    (cur ? cur.turn.events : preEvents).push(e);
  };
  const takeSnapshot = (): void => {
    if (!cur || !cur.pending) return;
    refresh(boards[cur.turn.active]);
    cur.turn.snapshot = { me: snapshotBoard(boards.me, "me"), opp: snapshotBoard(boards.opp, "opp") } as SimSnapshot;
    cur.pending = false;
  };
  const openTurn = (side: SimSide): void => {
    const turn: SimTurn = {
      number: turns.length + 1,
      active: side,
      snapshot: undefined as unknown as SimSnapshot,
      events: [],
    };
    cur = { turn, pending: true };
    turns.push(cur);
    active = side;
  };
  /** Gameplay is underway: make sure turn 1 exists and its snapshot is taken. */
  const startPlay = (): void => {
    if (!cur) openTurn(firstPlayer);
  };
  const findChar = (b: Board, id: string, preferRested: boolean): Char | null => {
    let fallback: Char | null = null;
    for (const c of b.chars) {
      if (c.id !== id) continue;
      if (c.rested === preferRested) return c;
      fallback ??= c;
    }
    return fallback;
  };
  const setRested = (side: SimSide, id: string, rested: boolean): void => {
    const b = boards[side];
    if (b.leaderId === id && b.leaderRested !== rested) {
      b.leaderRested = rested;
      return;
    }
    const c = findChar(b, id, !rested);
    if (c) c.rested = rested;
  };

  const handleMove = (p: string[]): void => {
    const owner = Number(p[2]);
    const side = ownerSide.get(owner);
    if (!side) return;
    startPlayIfGameplay(p);
    const id = p[3];
    const oz = Number(p[4]);
    const os = Number(p[5]);
    const nz = Number(p[6]);
    const ns = Number(p[7]);
    const rested = p[10] === "1";
    const power = Number(p[11]) || 0;
    const b = boards[side];
    if (id === "Don") {
      removeDon(b, oz, os);
      addDon(b, nz, ns, rested);
      return;
    }
    if (oz === nz) {
      if (oz === 2 || oz === 7) {
        const ch = removeCard(b, oz, os, id);
        addCard(b, oz, ns, id, rested, power, true, ch);
        if (oz === 2) b.orphanAttached.delete(os); // attachments stayed with the card
      }
      return;
    }
    // Public information: a card coming back from the board/trash is known to both players.
    const seen = oz === 2 || oz === 6 || oz === 7;
    const gone = removeCard(b, oz, os, id);
    addCard(b, nz, ns, id, rested, power, seen, gone);
    if (oz === 3) {
      push({ kind: "lifeTaken", side, cardId: id, to: nz === 1 ? "hand" : nz === 6 ? "trash" : "other" });
    } else if (nz === 6 && oz !== 6) {
      push({ kind: "trash", side, cardId: id, from: ZONE_NAME[oz] ?? "other" });
    }
  };
  // Setup shuffles and the opening hand deal happen before turn 1; anything else means play started.
  const startPlayIfGameplay = (p: string[]): void => {
    if (cur) return;
    const oz = Number(p[4]);
    const nz = Number(p[6]);
    const setup = (oz === 0 && (nz === 0 || nz === 1 || nz === 3)) || (oz === 1 && nz === 0) || (oz === 4 && nz === 4);
    if (!setup) startPlay();
  };

  const handleChk = (p: string[]): void => {
    const side = ownerSide.get(Number(p[3]));
    if (!side) return;
    const b = boards[side];
    const exp = {
      deck: b.deck,
      hand: b.hand.length,
      characters: b.chars.length,
      life: b.life,
      donDeck: b.donDeck,
      donField: b.donField.length,
      trash: b.trash.length,
      stage: b.stage.length,
      attachedDon: attachedTotal(b),
    };
    const act: Record<string, number> = {
      deck: Number(p[4]),
      hand: Number(p[5]),
      characters: Number(p[6]),
      life: Number(p[7]),
      donDeck: Number(p[8]),
      donField: Number(p[9]),
      trash: Number(p[10]),
      stage: Number(p[11]),
      attachedDon: Number(p[13]),
    };
    chkChecked++;
    for (const [field, expected] of Object.entries(exp)) {
      if (expected !== act[field]) {
        chkMismatches.push({ seq: Number(p[2]), side, field, expected, actual: act[field] });
      }
    }
  };

  const handleText = (rawLine: string): void => {
    const text = cleanSimText(rawLine);
    if (!text) return;
    if (META.some((r) => r.test(text))) return;
    let side: SimSide | null = null;
    let body = text;
    const pm = RE.prefix.exec(text);
    if (pm) {
      const n = normalizeSimName(pm[1]);
      const s = n === "You" ? null : sideOfName(n);
      if (s || n === "You") {
        side = s;
        body = pm[2];
      }
    }
    if (META.some((r) => r.test(body))) return;
    const sd = side ?? active; // side for unprefixed lines: the active player

    let m: RegExpExecArray | null;
    if ((m = RE.leader.exec(body))) {
      push({ kind: "setup", side, what: "leader", detail: m[2] });
      return;
    }
    if (RE.chose.test(body)) {
      push({ kind: "setup", side, what: "chooseOrder", detail: body.slice(11) });
      return;
    }
    if (body === "Mulligan") {
      if (side) players[side].mulligan = true;
      push({ kind: "setup", side, what: "mulligan" });
      return;
    }
    if ((m = RE.drawDon.exec(body))) {
      startPlay();
      push({ kind: "drawDon", side: sd, count: Number(m[1]) });
      takeSnapshot();
      return;
    }
    if ((m = RE.draw.exec(body))) {
      startPlay();
      push({ kind: "draw", side: sd, count: Number(m[1]) });
      return;
    }
    if (body === "End Turn") {
      startPlay();
      takeSnapshot();
      push({ kind: "endTurn", side: sd });
      openTurn(other(sd));
      return;
    }
    // Everything below is in-turn action: the turn-start snapshot must already exist.
    const gameplay = (): void => {
      startPlay();
      takeSnapshot();
    };
    if ((m = RE.deploy.exec(body))) {
      gameplay();
      push({ kind: "play", side: sd, cardId: m[2], name: m[1], zone: "unknown" });
      return;
    }
    if ((m = RE.attach.exec(body))) {
      gameplay();
      push({ kind: "attachDon", side: sd, targetId: m[3], count: Number(m[1]), total: Number(m[4]) });
      return;
    }
    if ((m = RE.attack.exec(body))) {
      gameplay();
      setRested(sd, m[2], true);
      push({ kind: "attack", side: sd, attackerId: m[2], targetId: m[4] });
      return;
    }
    if ((m = RE.block.exec(body))) {
      gameplay();
      push({ kind: "block", side: sd, blockerId: m[2] });
      return;
    }
    if ((m = RE.counterDiscard.exec(body))) {
      gameplay();
      push({ kind: "counter", side: sd, cardId: m[2], value: Number(m[3]), via: "discard" });
      return;
    }
    if ((m = RE.destroyed.exec(body))) {
      gameplay();
      push({ kind: "ko", side: sd, cardId: m[2] });
      return;
    }
    if ((m = RE.battle.exec(body))) {
      gameplay();
      push({
        kind: "battle",
        attackerId: m[2],
        attackerPower: Number(m[3]),
        targetId: m[5],
        targetPower: Number(m[6]),
      });
      return;
    }
    if ((m = RE.hit.exec(body))) {
      gameplay();
      push({ kind: "damage", sourceId: m[2], amount: Number(m[3]) });
      return;
    }
    if (body === "Attack Fails") {
      gameplay();
      push({ kind: "attackFails" });
      return;
    }
    if ((m = RE.effect.exec(body))) {
      gameplay();
      const eff = m[3];
      const em = RE.counterEffect.exec(eff);
      if (em) {
        push({ kind: "counter", side: sd, cardId: m[2], value: em[1] ? Number(em[1]) : null, via: "effect" });
        return;
      }
      const rm = RE.restSelf.exec(eff);
      if (rm && rm[1] !== "Don") setRested(sd, rm[1], true);
      const am = RE.setActive.exec(eff);
      if (am) setRested(sd, am[1], false);
      push({ kind: "effect", side, sourceId: m[2], text: eff });
      return;
    }
    for (const [re, what] of RESULTS) {
      if (re.test(body)) {
        push({ kind: "result", side, what });
        return;
      }
    }
    if (INFO.some((r) => r.test(body))) {
      push({ kind: "info", side, text: body });
      return;
    }
    unknownLines.push(text);
    push({ kind: "unknown", text });
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (!raw) continue;
    if (raw.startsWith("RZ1|")) {
      if (li < boundary) continue;
      const p = raw.split("|");
      if (p[1] === "CHK") handleChk(p);
      else if (/^\d+$/.test(p[1] ?? "")) handleMove(p);
      continue;
    }
    handleText(raw);
  }
  if (cur) takeSnapshot();

  const result = normalizeSimName(match.result).toLowerCase();
  const winner: SimGame["winner"] = result === "won" ? "me" : result === "lost" ? "opp" : null;

  return {
    me: players.me,
    opp: players.opp,
    players: [players.me, players.opp],
    firstPlayer,
    turnOrder: typeof match.turnOrder === "number" ? match.turnOrder : null,
    winner,
    date: match.date ?? null,
    simVersion,
    turns: turns.map((t) => t.turn),
    preEvents,
    unknownLines,
    chkChecked,
    chkMismatches,
  };
}

/** Parse every game that has a combat log; games without one are skipped. */
export function parseSimExport(matches: readonly SimMatchRecord[]): { games: SimGame[]; report: SimParseReport } {
  const games: SimGame[] = [];
  let skipped = 0;
  for (const m of matches) {
    if (!m || typeof m.combatLog !== "string" || !m.combatLog) {
      skipped++;
      continue;
    }
    games.push(parseSimGame(m));
  }
  return { games, report: buildParseReport(games, matches.length, skipped) };
}

/** Collapse a line into a pattern: card ids, names before ids, player prefixes and digits are blanked. */
export function unknownLinePattern(line: string): string {
  return line
    .replace(/^\[[^\]]*\]/, "[P]")
    .replace(/[^\[\]:]*?\[[^\[\]\s]+\]/g, " X")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildParseReport(games: readonly SimGame[], input: number, skipped: number): SimParseReport {
  const eventsByKind: SimParseReport["eventsByKind"] = {};
  const pats = new Map<string, { count: number; example: string }>();
  let turns = 0;
  let unknown = 0;
  let chkChecked = 0;
  let chkMismatchCount = 0;
  let chkMismatchGames = 0;
  const samples: SimParseReport["chkMismatchSamples"] = [];
  games.forEach((g, gi) => {
    turns += g.turns.length;
    for (const e of [...g.preEvents, ...g.turns.flatMap((t) => t.events)]) {
      eventsByKind[e.kind] = (eventsByKind[e.kind] ?? 0) + 1;
    }
    for (const l of g.unknownLines) {
      unknown++;
      const k = unknownLinePattern(l);
      const cur = pats.get(k);
      if (cur) cur.count++;
      else pats.set(k, { count: 1, example: l });
    }
    chkChecked += g.chkChecked;
    chkMismatchCount += g.chkMismatches.length;
    if (g.chkMismatches.length) chkMismatchGames++;
    for (const mm of g.chkMismatches.slice(0, 3)) if (samples.length < 10) samples.push({ game: gi, mismatch: mm });
  });
  return {
    gamesInput: input,
    gamesParsed: games.length,
    gamesSkippedNoLog: skipped,
    turns,
    eventsByKind,
    unknownLineCount: unknown,
    unknownPatterns: [...pats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([pattern, v]) => ({ pattern, count: v.count, example: v.example })),
    chkChecked,
    chkMismatchCount,
    chkMismatchGames,
    chkMismatchSamples: samples,
  };
}
