import { lookupCard } from "../cards/atlas";
import { endReasonLabel } from "./matchResult";

/**
 * Visual weight of a log line. `routine` lines (phases, DON!!, draws, buffs)
 * are dimmed; everything else gets an icon + accent color in the panel.
 */
export type LogTone =
  | "routine"
  | "phase"
  | "play"
  | "attack"
  | "block"
  | "counter"
  | "hit"
  | "miss"
  | "ko"
  | "damage"
  | "search"
  | "trash"
  | "effect"
  | "trigger"
  | "reveal"
  | "win";

/** A run of plain text, or a card name the panel renders as an inspect button. */
export type LogSegment =
  | { kind: "text"; text: string }
  | { kind: "card"; defId: string; name: string; ownerSeat?: 0 | 1 };

export type BattleLogEntry = {
  id: string;
  turn: number;
  /** Plain-text rendering of `segments` (tests, a11y, copy). */
  text: string;
  tone: LogTone;
  /** Key moment: bold + accent (counters, K.O.s, Life, searches, discards…). */
  important: boolean;
  segments: LogSegment[];
  /**
   * Set when the line shows a card being revealed (a reveal, or a search that
   * reveals and adds to hand): the card to put on screen for the viewer.
   */
  reveal?: { defId: string; ownerSeat: 0 | 1 };
};

/** Board instance → card identity, remembered across views (K.O.'d cards too). */
export type InstanceIndex = Map<string, { defId: string; seat: 0 | 1 }>;

type LooseEvent = { type?: string; [key: string]: unknown };

type ViewLike = {
  seat: number;
  you: { leader: { id: string; defId: string }; characters: { id: string; defId: string }[]; stage: { id: string; defId: string } | null };
  opponent: { leader: { id: string; defId: string }; characters: { id: string; defId: string }[]; stage: { id: string; defId: string } | null };
};

/** Record every visible board card so later events can name attackers / blockers. */
export function indexViewInstances(view: ViewLike | null | undefined, into: InstanceIndex): void {
  if (!view) return;
  const you = view.seat === 1 ? 1 : 0;
  const sides = [
    [view.you, you],
    [view.opponent, (1 - you) as 0 | 1],
  ] as const;
  for (const [side, seat] of sides) {
    if (!side) continue;
    for (const c of [side.leader, ...(side.characters ?? []), side.stage]) {
      if (c?.id && c.defId && c.defId !== "HIDDEN") into.set(c.id, { defId: c.defId, seat });
    }
  }
}

type Ctx = { youSeat: number | null; instances?: InstanceIndex };
type Part = string | LogSegment | null | false | undefined;

function isHiddenDef(defId: unknown): boolean {
  return typeof defId !== "string" || defId === "" || defId === "HIDDEN";
}

function asSeat(seat: unknown): 0 | 1 | undefined {
  return seat === 0 || seat === 1 ? seat : undefined;
}

/** Card segment, or plain "a card" when the identity is hidden from this viewer. */
function card(defId: unknown, seat?: unknown, fallback = "a card"): LogSegment {
  if (isHiddenDef(defId)) return { kind: "text", text: fallback };
  const id = defId as string;
  return { kind: "card", defId: id, name: lookupCard(id).name, ownerSeat: asSeat(seat) };
}

function seatLabel(seat: unknown, youSeat: number | null): string {
  if (typeof seat !== "number") return "A player";
  if (youSeat === 0 || youSeat === 1) {
    return seat === youSeat ? "You" : "Opponent";
  }
  return `Seat ${seat}`;
}

function possessive(seat: unknown, youSeat: number | null): string {
  const who = seatLabel(seat, youSeat);
  return who === "You" ? "Your" : `${who}'s`;
}

function isYou(seat: unknown, youSeat: number | null): boolean {
  return (youSeat === 0 || youSeat === 1) && seat === youSeat;
}

/** "You play" / "Opponent plays" */
function act(seat: unknown, youSeat: number | null, youVerb: string, theyVerb: string): string {
  return `${seatLabel(seat, youSeat)} ${isYou(seat, youSeat) ? youVerb : theyVerb}`;
}

type Line = { tone: LogTone; important?: boolean; parts: Part[] };

function line(tone: LogTone, important: boolean, ...parts: Part[]): Line {
  return { tone, important, parts };
}

function toSegments(parts: Part[]): LogSegment[] {
  const out: LogSegment[] = [];
  for (const p of parts) {
    if (p == null || p === false || p === "") continue;
    const seg: LogSegment = typeof p === "string" ? { kind: "text", text: p } : p;
    const prev = out[out.length - 1];
    if (seg.kind === "text" && prev?.kind === "text") prev.text += seg.text;
    else out.push(seg.kind === "text" ? { ...seg } : seg);
  }
  return out;
}

/** A log segment plus the punctuation that must stay on the same line (cards only). */
export type GluedSegment = { seg: LogSegment; glued: string };

/**
 * A card name carries the text right after it up to the next space ("'s", ".",
 * ")"). The name is a button, an atomic inline box, so without this a narrow
 * column can wrap right after it and strand "'s effect" on the next line,
 * which reads as a stray space ("Edward.Newgate 's effect").
 */
export function glueSegments(segments: readonly LogSegment[]): GluedSegment[] {
  const out: GluedSegment[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    const next = segments[i + 1];
    if (seg.kind === "card" && next?.kind === "text") {
      const glued = /^\S+/.exec(next.text)?.[0] ?? "";
      out.push({ seg, glued });
      const rest = next.text.slice(glued.length);
      if (rest) out.push({ seg: { kind: "text", text: rest }, glued: "" });
      i += 1;
    } else {
      out.push({ seg, glued: "" });
    }
  }
  return out;
}

export function segmentsText(segments: readonly LogSegment[]): string {
  return segments.map((s) => (s.kind === "text" ? s.text : s.name)).join("");
}

const ZONE_LABEL: Record<string, string> = {
  hand: "hand",
  deck: "deck",
  trash: "trash",
  life: "Life",
  character: "the field",
  stage: "the field",
  leader: "the field",
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Narrate raw `events` payloads from the game server.
 * Event `type` strings must match `@optcg/rules` `GameEvent` (no rules import in SPA).
 * Events are already projected per viewer: hidden cards arrive as `"HIDDEN"`.
 */
export function narrateEvents(
  events: readonly unknown[],
  opts: { youSeat: number | null; turnNumber: number; instances?: InstanceIndex },
): BattleLogEntry[] {
  const out: BattleLogEntry[] = [];
  const ctx: Ctx = { youSeat: opts.youSeat, instances: opts.instances };
  const list = events as readonly LooseEvent[];
  let i = 0;
  let carriedReveal: BattleLogEntry["reveal"];
  for (let idx = 0; idx < list.length; idx += 1) {
    const e = list[idx] ?? {};
    const next = list[idx + 1];
    // A revealed search reads as one line ("reveals and adds X to hand").
    if (
      e.type === "card_revealed" &&
      next?.type === "card_moved" &&
      next.to === "hand" &&
      next.from === "deck" &&
      next.seat === e.seat &&
      next.defId === e.defId
    ) {
      carriedReveal = revealOf(e);
      continue;
    }
    const prev = list[idx - 1];
    const l = narrateOne(e, ctx, prev);
    const reveal = e.type === "card_revealed" ? revealOf(e) : carriedReveal;
    carriedReveal = undefined;
    if (!l) continue;
    const segments = toSegments(l.parts);
    out.push({
      id: `${opts.turnNumber}-${e.type ?? "evt"}-${i++}-${Math.random().toString(36).slice(2, 7)}`,
      turn: opts.turnNumber,
      text: segmentsText(segments),
      tone: l.tone,
      important: Boolean(l.important),
      segments,
      ...(reveal ? { reveal } : {}),
    });
  }
  return out;
}

function instanceCard(ctx: Ctx, id: unknown, fallback: string): LogSegment {
  const hit = typeof id === "string" ? ctx.instances?.get(id) : undefined;
  return hit ? card(hit.defId, hit.seat) : { kind: "text", text: fallback };
}

/** The visible card of a `card_revealed` event (hidden for a viewer who can't see it). */
function revealOf(e: LooseEvent): BattleLogEntry["reveal"] {
  const seat = asSeat(e.seat);
  return seat != null && !isHiddenDef(e.defId) ? { defId: e.defId as string, ownerSeat: seat } : undefined;
}

function narrateOne(e: LooseEvent, ctx: Ctx, prev: LooseEvent | undefined): Line | null {
  const { youSeat } = ctx;
  switch (e.type) {
    case "mulligan_resolved":
      return line(
        "routine",
        false,
        `${act(e.seat, youSeat, e.didMulligan ? "mulligan" : "keep", e.didMulligan ? "mulligans" : "keeps")} opening hand`,
      );
    case "phase_changed":
      // Only the Main phase rule is news: the turn header already names the rest.
      if (e.phase === "main") return line("phase", false, `—— Main phase · ${seatLabel(e.activeSeat, youSeat)} ——`);
      return null;
    case "drew":
      return line("routine", false, `${act(e.seat, youSeat, "draw", "draws")} ${Number(e.count) || 1}`);
    case "don_placed": {
      const count = Number(e.count) || 0;
      // "You place 0 DON!!" (an empty DON!! deck) is noise.
      if (count <= 0) return null;
      return line("routine", false, `${act(e.seat, youSeat, "place", "places")} ${count} DON!!`);
    }
    case "card_played": {
      const paid = typeof e.costPaid === "number" ? ` (rests ${e.costPaid} DON!!)` : "";
      return line("play", false, `${act(e.seat, youSeat, "play", "plays")} `, card(e.defId, e.seat), paid);
    }
    case "stage_replaced":
      return line("trash", false, `${act(e.seat, youSeat, "replace", "replaces")} Stage (trashes `, card(e.trashedDefId, e.seat), ")");
    case "stage_trashed":
      return line("trash", false, `${act(e.seat, youSeat, "trash", "trashes")} Stage `, card(e.defId, e.seat));
    case "character_trashed_for_space":
      return line("trash", true, `${act(e.seat, youSeat, "trash", "trashes")} `, card(e.defId, e.seat), " for board space");
    case "don_given": {
      const pow = typeof e.newPower === "number" ? ` → ${e.newPower} power` : "";
      return line("routine", false, `${act(e.seat, youSeat, "attach", "attaches")} DON!! to `, card(e.targetDefId, e.seat), pow);
    }
    case "attack_declared": {
      const target = e.target as { kind?: string; instanceId?: string } | undefined;
      const defSeat = typeof e.seat === "number" ? 1 - e.seat : undefined;
      const tgtCard = instanceCard(ctx, target?.instanceId, "a Character");
      // Mid-sentence: "attacks your Leader", not "attacks Your Leader".
      const defPoss = possessive(defSeat, youSeat).replace(/^Your$/, "your");
      const tgt: Part[] =
        target?.kind === "leader"
          ? [`${defPoss} Leader`]
          : tgtCard.kind === "card"
            ? [`${defPoss} `, tgtCard]
            : [tgtCard];
      const attacker = ctx.instances?.get(String(e.attackerId ?? ""));
      const atk = typeof e.attackerPower === "number" ? e.attackerPower : null;
      const def = typeof e.defenderPower === "number" ? e.defenderPower : null;
      const pow = atk != null && def != null ? ` (${atk} vs ${def})` : "";
      return line(
        "attack",
        false,
        attacker ? `${possessive(e.seat, youSeat)} ` : seatLabel(e.seat, youSeat),
        attacker ? card(attacker.defId, attacker.seat) : null,
        attacker ? " attacks " : isYou(e.seat, youSeat) ? " attack " : " attacks ",
        ...tgt,
        pow,
      );
    }
    case "blocked": {
      const blocker = ctx.instances?.get(String(e.blockerId ?? ""));
      return blocker
        ? line("block", true, `${act(e.seat, youSeat, "block", "blocks")} with `, card(blocker.defId, blocker.seat))
        : line("block", true, act(e.seat, youSeat, "block", "blocks"));
    }
    case "counter_applied": {
      const bonus = Number(e.bonus) || 0;
      return line(
        "counter",
        true,
        `${act(e.seat, youSeat, "counter", "counters")} with `,
        card(e.defId, e.seat),
        bonus > 0 ? ` (+${bonus})` : " (Event)",
      );
    }
    case "battle_resolved": {
      const atk = typeof e.attackerPower === "number" ? e.attackerPower : null;
      const def = typeof e.defenderPower === "number" ? e.defenderPower : null;
      const pow = atk != null && def != null ? ` (${atk} vs ${def})` : "";
      return line(e.attackerWon ? "hit" : "miss", false, `Battle ${e.attackerWon ? "hits" : "fails"}${pow}`);
    }
    case "character_ko":
      return line("ko", true, `${possessive(e.seat, youSeat)} `, card(e.defId, e.seat), " is K.O.'d");
    case "life_taken": {
      const who = act(e.seat, youSeat, "take", "takes");
      if (isHiddenDef(e.defId)) {
        return line("damage", true, `${who} 1 damage${e.toHand ? " (Life → hand)" : " (Trigger check)"}`);
      }
      return line(
        "damage",
        true,
        `${who} 1 damage (`,
        card(e.defId, e.seat),
        e.toHand ? " → hand)" : ", Trigger pending)",
      );
    }
    case "life_added":
      return line(
        "effect",
        false,
        `${act(e.seat, youSeat, "add", "adds")} `,
        card(e.defId, e.seat, "a card"),
        ` to Life${e.faceUp ? " face-up" : ""}`,
      );
    case "trigger_available":
      return line("trigger", true, `${possessive(e.seat, youSeat)} Life card has a Trigger (`, card(e.defId, e.seat, "hidden"), ")");
    case "trigger_resolved":
      return line("trigger", Boolean(e.accepted), `${act(e.seat, youSeat, e.accepted ? "activate" : "decline", e.accepted ? "activates" : "declines")} the Trigger`);
    case "card_revealed":
      return line("reveal", true, `${act(e.seat, youSeat, "reveal", "reveals")} `, card(e.defId, e.seat));
    case "card_moved":
      return narrateMove(e, ctx, prev);
    case "ability_activated": {
      const who = possessive(e.seat, youSeat);
      const def = isHiddenDef(e.defId) ? null : lookupCard(e.defId as string);
      const isLeader = def?.type === "leader";
      return line("effect", isLeader, `${who} `, isLeader ? "Leader " : "", card(e.defId, e.seat), " activates its effect");
    }
    case "power_buff_applied": {
      const amount = Number(e.amount) || 0;
      const dur = e.duration === "battle" ? " this battle" : e.duration === "turn" ? " this turn" : "";
      return line("routine", false, card(e.targetDefId, e.seat), ` ${signed(amount)} power${dur}`);
    }
    case "pending_choice_added": {
      // Mandatory effect prompts are already narrated by the ability line.
      if (e.kind === "effect" && !e.optional) return null;
      if (e.kind === "order_effects") return null;
      const kind = typeof e.kind === "string" ? e.kind.replace(/_/g, " ") : "ability";
      return line("routine", false, `${seatLabel(e.seat, youSeat)} may resolve `, card(e.cardDefId, e.seat, "a hidden card"), `'s ${kind}`);
    }
    case "pending_choice_resolved": {
      if (e.kind === "order_effects") return null;
      if (e.kind === "effect") {
        // Picks/looks are implied by the lines that follow; only a skip is news.
        if (e.accepted) return null;
        return line("routine", false, `${act(e.seat, youSeat, "decline", "declines")} `, card(e.cardDefId, e.seat, "a hidden card"), "'s effect");
      }
      const kind = typeof e.kind === "string" ? e.kind.replace(/_/g, " ") : "ability";
      const verb = e.accepted ? act(e.seat, youSeat, "accept", "accepts") : act(e.seat, youSeat, "decline", "declines");
      return line("routine", false, `${verb} `, card(e.cardDefId, e.seat, "a hidden card"), `'s ${kind}`);
    }
    case "game_over": {
      const label = endReasonLabel(typeof e.reason === "string" ? e.reason : null);
      return line("win", true, `★ ${act(e.winner, youSeat, "win", "wins")} — ${label}`);
    }
    default:
      return null;
  }
}

function narrateMove(e: LooseEvent, ctx: Ctx, prev: LooseEvent | undefined): Line | null {
  const { youSeat } = ctx;
  const from = String(e.from ?? "");
  const to = String(e.to ?? "");
  const hidden = isHiddenDef(e.defId);
  const c = card(e.defId, e.seat);
  const revealed = prev?.type === "card_revealed" && prev.defId === e.defId && prev.seat === e.seat;

  if (to === "hand") {
    if (from === "deck") {
      if (hidden) return line("search", false, `${act(e.seat, youSeat, "add", "adds")} a card from deck to hand`);
      return line(
        "search",
        true,
        `${act(e.seat, youSeat, revealed ? "reveal and add" : "add", revealed ? "reveals and adds" : "adds")} `,
        c,
        " to hand",
        !revealed && e.hidden ? " (hidden from opponent)" : "",
      );
    }
    if (from === "life") {
      return line("damage", true, `${act(e.seat, youSeat, "add", "adds")} `, hidden ? "a Life card" : c, " to hand");
    }
    if (from === "trash") return line("search", true, `${act(e.seat, youSeat, "return", "returns")} `, c, " from trash to hand");
    if (from === "character" || from === "stage") return line("effect", true, `${possessive(e.seat, youSeat)} `, c, " is returned to hand");
  }
  if (to === "trash") {
    if (from === "hand") return line("trash", true, `${act(e.seat, youSeat, "trash", "trashes")} `, c, " from hand");
    if (from === "deck") return line("trash", false, `${act(e.seat, youSeat, "trash", "trashes")} `, c, " from the top of deck");
    if (from === "life") return line("damage", true, `${possessive(e.seat, youSeat)} Life card `, c, " is trashed");
    if (from === "character" || from === "stage") return line("trash", true, `${possessive(e.seat, youSeat)} `, c, " is trashed");
  }
  if (to === "deck") {
    const what: Part = hidden ? (from === "hand" ? "a card from hand" : from === "life" ? "a Life card" : "a card") : c;
    if (from === "character" || from === "stage") return line("effect", true, `${possessive(e.seat, youSeat)} `, c, " is placed into the deck");
    return line("routine", false, `${act(e.seat, youSeat, "place", "places")} `, what, " into the deck");
  }
  if (to === "life") {
    return line("effect", false, `${act(e.seat, youSeat, "add", "adds")} `, hidden ? "a card" : c, " to Life");
  }
  const fromLabel = ZONE_LABEL[from] ?? from;
  const toLabel = ZONE_LABEL[to] ?? to;
  return line("routine", false, `${act(e.seat, youSeat, "move", "moves")} `, c, ` from ${fromLabel} to ${toLabel}`);
}

/** Group flat entries into turn sections (ascending turn number). */
export function groupBattleLogByTurn(
  entries: readonly BattleLogEntry[],
): { turn: number; lines: BattleLogEntry[] }[] {
  const map = new Map<number, BattleLogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.turn) ?? [];
    list.push(e);
    map.set(e.turn, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, lines]) => ({ turn, lines }));
}

/**
 * Battle log after an accepted undo: turns past `toTurn` no longer happened,
 * so their lines go (the replayed turns would otherwise merge into them);
 * `toTurn` keeps its lines and gains a marker so the rewind is visible.
 */
export function rewindBattleLog(
  entries: readonly BattleLogEntry[],
  toTurn: number,
  by: 0 | 1,
  youSeat: number | null,
): BattleLogEntry[] {
  const who = youSeat == null ? `Seat ${by}` : by === youSeat ? "You" : "Opponent";
  const text = `${who} undid the turn — rewound to the start of turn ${toTurn}.`;
  return [
    ...entries.filter((e) => e.turn <= toTurn),
    {
      id: `${toTurn}-undo-${Math.random().toString(36).slice(2, 9)}`,
      turn: toTurn,
      text,
      tone: "effect",
      important: true,
      segments: [{ kind: "text", text }],
    },
  ];
}
