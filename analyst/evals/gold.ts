/**
 * The gold for a case: what a tool, the engine or the official FAQ says, resolved at run time.
 *  - A: the live FAQ row (found by question hash), errata or ban list, never stored in git.
 *  - B: the verdict or number the engine scenario proves (truth.test.ts runs it in CI).
 *  - C: the tool the model calls, run again here and compared with the committed `expect`.
 *  - D, E: nothing computed; the rubric judge grades them.
 */
import { deckSourceId } from "../src/sources";
import type { Catalog } from "../src/catalog";
import { parseDeckText } from "../src/decks";
import { cardRulings } from "../src/knowledge";
import type { OfficialLibrary } from "../src/official/library";
import { within } from "../src/official/library";
import { buildTools } from "../src/server";
import { dateForms, resolveCardRuling, resolveErrata, resolveGeneral } from "./faq";
import type { CaseA, CaseB, CaseC, Cites, EvalCase, Gold } from "./types";

/** Thrown when the official site can't be read, so a case is not mistaken for a stale or empty reference. */
export class OfficialUnavailable extends Error {}

export type GoldContext = { catalog: Catalog; library?: OfficialLibrary };

const WAIT_MS = 60_000;

/** Replaces `{faq}`, `{deck}` and `{errata}` with the source ids resolved for this case. */
export function resolveCites(cites: Cites, values: { faq?: string; errata?: string; deck?: string }): Cites {
  const fill = (rule: string) => (rule === "{faq}" ? values.faq : rule === "{errata}" ? values.errata : rule === "{deck}" ? values.deck : rule) ?? rule;
  return { all: cites.all.map((g) => g.map(fill)), none: cites.none?.map(fill) };
}

function deckId(catalog: Catalog, deckText: string | undefined): string | undefined {
  if (!deckText) return undefined;
  const deck = parseDeckText(catalog, deckText);
  return deckSourceId(deck.leaderId ?? undefined, deck.cards);
}

const ok = (g: Omit<Gold, "status">): Gold => ({ status: "ok", ...g });
const flagged = (status: "stale" | "gold_drift", reason: string, cites: Cites): Gold => ({ status, reason, cites });

async function goldA(c: CaseA, ctx: GoldContext): Promise<Gold> {
  const lib = ctx.library;
  if (!lib) return flagged("stale", "no official library to read the FAQ from", c.cites);
  const f = c.faq;
  if ("card" in f || "noRuling" in f || "errata" in f) {
    const card = "card" in f ? f.card : "noRuling" in f ? f.noRuling : f.errata;
    const result = await cardRulings(lib, ctx.catalog, [card]);
    if (result.notes.some((n) => /couldn't read|couldn't be read/.test(n))) throw new OfficialUnavailable(result.notes.join(" "));
    const entry = result.cards[0]!;
    if ("noRuling" in f) {
      return entry.rulings.length
        ? flagged("stale", `${card} now has ${entry.rulings.length} official rulings`, c.cites)
        : ok({ cites: resolveCites(c.cites, {}), verdict: "no_ruling" });
    }
    if ("errata" in f) {
      const e = resolveErrata(entry.errata, card, f.k);
      if (e === "stale") return flagged("stale", `${card} has no erratum number ${f.k}`, c.cites);
      if (c.date && !dateForms(e.date).some((d) => dateForms(c.date!).includes(d))) return flagged("gold_drift", `${card} erratum ${f.k} is dated ${e.date}, the case says ${c.date}`, c.cites);
      return ok({ cites: resolveCites(c.cites, { faq: e.source }), verdict: "yes", dates: dateForms(e.date) });
    }
    const r = resolveCardRuling(entry.rulings, card, f.qh);
    if (r === "stale" || r === "ambiguous") return flagged("stale", `${card}: no single FAQ row has question hash ${f.qh} (${r})`, c.cites);
    if (r.polarity !== c.verdict) return flagged("gold_drift", `${r.source} now answers ${r.polarity}, the case says ${c.verdict}`, c.cites);
    return ok({ cites: resolveCites(c.cites, { faq: r.source }), verdict: r.polarity });
  }
  const faq = await within(lib.faq(), WAIT_MS).catch(() => undefined);
  if (!faq) throw new OfficialUnavailable("The official FAQ could not be read.");
  const r = resolveGeneral(faq.general, f.general);
  if (r === "stale" || r === "ambiguous") return flagged("stale", `no single general Q&A has question hash ${f.general} (${r})`, c.cites);
  if (r.polarity !== c.verdict) return flagged("gold_drift", `${r.source} now answers ${r.polarity}, the case says ${c.verdict}`, c.cites);
  return ok({ cites: resolveCites(c.cites, { faq: r.source }), verdict: r.polarity });
}

function goldB(c: CaseB): Gold {
  return ok({ cites: c.cites, verdict: c.verdict, number: c.number, can: c.can, cannot: c.cannot, mustSay: c.mustSay });
}

async function goldC(c: CaseC, ctx: GoldContext): Promise<Gold> {
  const needsLibrary = c.live || c.tool === "card_rulings";
  if (needsLibrary && !ctx.library) return flagged("stale", "needs the official library", c.cites);
  const tools = buildTools(ctx.catalog, undefined, undefined, needsLibrary ? { library: ctx.library } : {});
  const tool = tools.find((t) => t.name === c.tool);
  if (!tool) return flagged("stale", `${c.tool} is not offered`, c.cites);
  const result = await tool.run(c.args);
  const text = result.content.map((x) => x.text).join("\n");
  if (result.isError) return flagged("gold_drift", `${c.tool} failed: ${text}`, c.cites);
  const v = JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cites = resolveCites(c.cites, { deck: deckId(ctx.catalog, c.deck) });
  const e = c.expect;
  if (e.kind === "legality") {
    if (v.banList?.checked === false) throw new OfficialUnavailable(String(v.banList.note));
    if (v.legal !== e.legal) return flagged("gold_drift", `analyze_deck says legal=${v.legal}, the case says ${e.legal}`, cites);
    if (e.hint) {
      const hint = (v.hints as { id: string; tier: string; cardIds?: string[] }[]).find((h) => h.id === e.hint && h.tier === "rule");
      if (!hint) return flagged("gold_drift", `no ${e.hint} hint any more`, cites);
      if (e.offending && JSON.stringify([...(hint.cardIds ?? [])].sort()) !== JSON.stringify([...e.offending].sort())) {
        return flagged("gold_drift", `hint ${e.hint} now names ${(hint.cardIds ?? []).join(", ")}`, cites);
      }
    } else if (e.legal && (v.hints as { tier: string }[]).some((h) => h.tier === "rule")) {
      return flagged("gold_drift", "a rule-tier hint appeared on a deck that should be legal", cites);
    }
    if (e.bannedPair) {
      const [a, b] = e.bannedPair;
      const problems = (v.banList?.problems ?? []) as { cards: string[] }[];
      if (!problems.some((p) => p.cards.includes(a) && p.cards.includes(b))) return flagged("gold_drift", `${a} + ${b} is no longer a banned pair`, cites);
    }
    return ok({ cites, legal: e.legal, offending: e.offending, mention: e.mention });
  }
  if (e.kind === "ban_status") {
    const status = String(v.cards?.[0]?.banStatus ?? "");
    if (!new RegExp(e.matches).test(status)) return flagged("gold_drift", `ban status is now "${status}"`, cites);
    return ok({ cites, legal: false });
  }
  const at = (v.byTurn as { turn: number; percent: number }[]).find((t) => t.turn === e.turn);
  if (!at || Math.abs(at.percent - e.percent) > 0.05) return flagged("gold_drift", `turn ${e.turn} is now ${at?.percent}%, the case says ${e.percent}%`, cites);
  if (e.hits !== undefined && v.hits !== e.hits) return flagged("gold_drift", `hits is now ${v.hits}, the case says ${e.hits}`, cites);
  return ok({ cites, percent: e.percent, hits: e.hits });
}

export async function goldFor(c: EvalCase, ctx: GoldContext): Promise<Gold> {
  switch (c.group) {
    case "A":
      return goldA(c, ctx);
    case "B":
      return goldB(c);
    case "C":
      return goldC(c, ctx);
    default:
      return ok({ cites: resolveCites(c.cites, { deck: deckId(ctx.catalog, c.deck) }) });
  }
}
