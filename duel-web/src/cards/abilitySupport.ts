/**
 * Client-side ability-support heuristics for CardInspect.
 * Does not import @optcg/rules — curated atlas may already carry abilitySupport
 * from export-atlas; cosmetics-only ids use printed-text heuristics.
 */

export type AbilitySupport =
  | "none"
  | "keywords"
  | "ok"
  | "partial"
  | "unsupported";

export type AbilitySupportInput = {
  effectText?: string;
  blocker?: boolean;
  rush?: boolean;
  hasTrigger?: boolean;
  /** Prefers export-atlas / EFFECT_CATALOG aggregate when present. */
  abilitySupport?: AbilitySupport;
};

const TIMING_TAG_RE =
  /\[(?:Activate:\s*Main|On Play|When Attacking|On K\.?O\.?|Opponent'?s Turn|On Your Opponent'?s Attack|On Opponent'?s Attack|Trigger|Counter|Main|Your Turn|Once Per Turn)[^\]]*\]/gi;

const KEYWORD_ONLY_RE =
  /\[(?:Blocker|Rush(?::[^\]]*)?)\](?:\s*\([^)]*\))?/gi;

function meaningfulRemainder(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(KEYWORD_ONLY_RE, " ")
    .replace(TIMING_TAG_RE, " ")
    .replace(/\u2014|\u2013|-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Infer whether printed text has clauses beyond simple Blocker/Rush/Trigger
 * keywords. Prefer `abilitySupport` from curated atlas when set.
 */
export function resolveAbilitySupport(entry: AbilitySupportInput): AbilitySupport {
  if (entry.abilitySupport) return entry.abilitySupport;

  const raw = entry.effectText?.trim() ?? "";
  if (!raw || raw === "—" || raw === "-") {
    if (entry.blocker || entry.rush || entry.hasTrigger) return "keywords";
    return "none";
  }

  const strippedKeywords = raw.replace(KEYWORD_ONLY_RE, " ").replace(/\s+/g, " ").trim();
  if (!strippedKeywords || strippedKeywords === "—" || strippedKeywords === "-") {
    return "keywords";
  }

  const afterTags = meaningfulRemainder(raw);
  const hasOtherTiming =
    /\[(?:On Play|When Attacking|Activate:|Counter|Main|On K\.?O\.?|Opponent)/i.test(
      raw,
    );
  const hasStaticBody = afterTags.length > 0;

  if (!hasOtherTiming && !hasStaticBody) {
    return "keywords";
  }

  if (
    entry.hasTrigger &&
    !hasOtherTiming &&
    /^\[Trigger\]/i.test(raw.replace(KEYWORD_ONLY_RE, "").trim()) &&
    afterTags.length < 8
  ) {
    return "keywords";
  }

  return "unsupported";
}

/** Non-alarmist note for Inspect when duel does not resolve the printed text. */
export function abilitySupportNote(support: AbilitySupport): string | null {
  if (support === "unsupported" || support === "partial") {
    return "Not implemented in duel yet — text shown for reference.";
  }
  return null;
}
