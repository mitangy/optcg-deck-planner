import { money, type PriceAlert } from "../api";

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type AlertTone = "watching" | "hit" | "met" | "paused";
export type AlertStatus = { label: string; tone: AlertTone };

export function alertStatus(
  a: Pick<PriceAlert, "paused" | "armed" | "triggered_at" | "triggered_price" | "met_now" | "direction" | "current_price">,
): AlertStatus {
  if (a.paused) return { label: "Paused", tone: "paused" };
  if (!a.armed && a.triggered_at) {
    const when = dayFmt.format(new Date(a.triggered_at));
    const hitPrice = a.triggered_price ?? a.current_price;
    return {
      label: hitPrice != null ? `Hit ${when} at ${money(hitPrice)}` : `Hit ${when}`,
      tone: "hit",
    };
  }
  if (a.met_now) {
    return { label: a.direction === "below" ? "Already below target" : "Already above target", tone: "met" };
  }
  return { label: "Watching", tone: "watching" };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Card name without the " - OP14-041" id suffix and a trailing " (Reprint)". Numbers like "(118)" stay. */
export function cleanCardName(cardName: string, cardId = ""): string {
  let name = cardName.trim().replace(/\s*\(Reprint\)\s*$/i, "");
  if (cardId) name = name.replace(new RegExp(`\\s+-\\s+${escapeRe(cardId)}\\s*$`, "i"), "");
  name = name.replace(/\s+-\s+[A-Z]{1,4}\d{1,2}-\d{3}\s*$/, "");
  return name.trim() || cardName;
}

/**
 * The art's own name: the card name, the card id, " - " joins and wrapping parentheses removed.
 * "Gol.D.Roger - OP09-118 (SP) (Wanted Poster)" -> "SP · Wanted Poster".
 */
export function shortArtName(artName: string, cardName: string, cardId = ""): string {
  if (artName === "Base") return "Base art";
  let rest = artName;
  for (const token of [cardName, cleanCardName(cardName, cardId), cardId]) {
    if (token) rest = rest.replace(new RegExp(escapeRe(token), "gi"), " ");
  }
  rest = rest.replace(/\(\s*\d{1,3}\s*\)/g, " ");
  const inside = [...rest.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());
  const outside = rest.replace(/\([^()]*\)/g, " ").replace(/^[\s\-–]+|[\s\-–]+$/g, "");
  const pieces = [outside, ...inside].filter((p) => p.trim());
  return pieces.length ? pieces.join(" · ") : artName;
}

export function artLabel(a: Pick<PriceAlert, "art_name" | "card_name" | "card_id" | "is_alt">): string {
  return a.is_alt ? shortArtName(a.art_name, a.card_name, a.card_id) : "Base art";
}

export type AlertDistance = { text: string; pct: number | null; atTarget: boolean };

/** "$42.17 above target · 22% to go", or "At target" once the condition holds. No price: null. */
export function alertDistance(a: Pick<PriceAlert, "current_price" | "target_price" | "direction">): AlertDistance | null {
  const cur = a.current_price;
  if (cur == null || !(cur > 0)) return null;
  const met = a.direction === "below" ? cur <= a.target_price : cur >= a.target_price;
  if (met) return { text: "At target", pct: 0, atTarget: true };
  const gap = Math.abs(cur - a.target_price);
  const pct = Math.round((gap / cur) * 100);
  return {
    text: `${money(gap)} ${a.direction === "below" ? "above" : "below"} target · ${pct}% to go`,
    pct: gap / cur,
    atTarget: false,
  };
}

/** Secondary line for an alert that fired earlier and is watching again. */
export function lastHitLine(a: Pick<PriceAlert, "armed" | "triggered_at" | "triggered_price" | "paused">): string | null {
  if (!a.armed || !a.triggered_at) return null;
  const when = dayFmt.format(new Date(a.triggered_at));
  return a.triggered_price != null ? `Last hit ${when} at ${money(a.triggered_price)}` : `Last hit ${when}`;
}

export type AlertGroupKey = "hit" | "watching" | "paused";
export type AlertGroup = { key: AlertGroupKey; title: string; alerts: PriceAlert[] };

const TITLES: Record<AlertGroupKey, string> = { hit: "Hit", watching: "Watching", paused: "Paused" };

/** Hit first (newest hit on top), then Watching (closest to target first), then Paused. Empty groups are left out. */
export function groupAlerts(alerts: readonly PriceAlert[]): AlertGroup[] {
  const buckets: Record<AlertGroupKey, PriceAlert[]> = { hit: [], watching: [], paused: [] };
  for (const a of alerts) {
    const tone = alertStatus(a).tone;
    buckets[tone === "hit" || tone === "met" ? "hit" : tone === "paused" ? "paused" : "watching"].push(a);
  }
  const hitTime = (a: PriceAlert) => (a.triggered_at ? new Date(a.triggered_at).getTime() : 0);
  buckets.hit.sort((x, y) => hitTime(y) - hitTime(x) || x.id - y.id);
  const gap = (a: PriceAlert) => alertDistance(a)?.pct ?? Number.POSITIVE_INFINITY;
  buckets.watching.sort((x, y) => gap(x) - gap(y) || x.id - y.id);
  buckets.paused.sort((x, y) => x.card_name.localeCompare(y.card_name) || x.id - y.id);
  return (["hit", "watching", "paused"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ key: k, title: TITLES[k], alerts: buckets[k] }));
}

/** How many alerts fired in the last `days` days (including ones that have re-armed since). */
export function recentHitCount(alerts: readonly PriceAlert[], now = Date.now(), days = 7): number {
  const since = now - days * 86_400_000;
  return alerts.filter((a) => a.triggered_at != null && new Date(a.triggered_at).getTime() >= since).length;
}

export function recentHitLine(count: number, days = 7): string | null {
  return count > 0 ? `${count} hit in the last ${days} days` : null;
}

/** Fill-in value for a quick chip: the current price moved by `pct` percent, to the cent. */
export function chipTarget(price: number | null | undefined, direction: "below" | "above", pct: number): string {
  if (price == null || !(price > 0)) return "";
  const t = direction === "below" ? price * (1 - pct / 100) : price * (1 + pct / 100);
  return (Math.round(t * 100) / 100).toFixed(2);
}

/** Money with thousands commas and two decimals ("1,900.00"), for target inputs at rest. */
export function formatTarget(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
