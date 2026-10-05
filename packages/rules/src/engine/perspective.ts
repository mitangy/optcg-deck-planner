/**
 * Rewrites an effect option label (written from the card controller's view) for
 * the controller's opponent, who sees it when "Your opponent chooses one" hands
 * them the choice: "Draw 2 cards." becomes "Your opponent draws 2 cards." and
 * "Your opponent trashes 2 cards from their hand." becomes "Trash 2 cards from
 * your hand." A sentence it can't parse keeps its original wording.
 */

const third = (verb: string): string =>
  /(sh|ch|s|x|z)$/i.test(verb) ? `${verb}es` : /[^aeiou]y$/i.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`;

const base = (verb: string): string =>
  /(sh|ch|ss|x|z)es$/i.test(verb) ? verb.slice(0, -2) : /ies$/i.test(verb) ? `${verb.slice(0, -3)}y` : verb.replace(/s$/i, "");

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Re-points possessives; `map` is keyed by the lower-case word. */
const swapOwners = (text: string, map: Record<string, string>): string =>
  text.replace(/\b(your opponent's|your|their)\b/gi, (word) => map[word.toLowerCase()] ?? word);

function flipSentence(sentence: string): string | null {
  const m = /^(Then, )?(.*)$/s.exec(sentence)!;
  const then = m[1] ?? "";
  const body = m[2]!;
  const opp = /^your opponent (\S+)( .*)?$/is.exec(body);
  if (opp) {
    // The chooser was the subject: make it an instruction to them.
    const rest = swapOwners(opp[2] ?? "", { their: "your", your: "your opponent's" });
    const verb = base(opp[1]!);
    return `${then}${then ? verb : cap(verb)}${rest}`;
  }
  const imp = /^([a-z][a-z.]*)( .*)?$/is.exec(body);
  if (!imp) return null;
  // An instruction to the controller: name them as the subject.
  const rest = swapOwners(imp[2] ?? "", { your: "their", "your opponent's": "your" });
  const verb = imp[1]!.includes(".") ? imp[1]! : imp[1]!.toLowerCase();
  return then ? `${then}they ${verb}${rest}` : `Your opponent ${third(verb)}${rest}`;
}

export function forOpponent(label: string): string {
  const out: string[] = [];
  for (const raw of label.split(/(?<=\.)\s+(?=[A-Z])/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const end = trimmed.endsWith(".") ? "." : "";
    const flipped = flipSentence(end ? trimmed.slice(0, -1) : trimmed);
    if (flipped == null) return label;
    out.push(flipped + end);
  }
  return out.join(" ");
}
