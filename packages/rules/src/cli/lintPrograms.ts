/**
 * Static lints over every compiled ability program (see tools/cardText/programLint.ts).
 *
 *   npm run lint:programs            # findings that are not allowlisted; exit 1 if any
 *   npm run lint:programs -- --all   # also list the allowlisted ones with their reasons
 */
import { abilityById } from "../cards/abilities.js";
import { applyAllowlist, PROGRAM_LINT_ALLOWLIST } from "../tools/cardText/programLintAllowlist.js";
import { formatFinding, lintRegistry, unknownVarFields } from "../tools/cardText/programLint.js";

const showAll = process.argv.includes("--all");
const result = applyAllowlist(lintRegistry());
const text = (abilityId: string) => abilityById(abilityId)?.ability.text.replace(/\s+/g, " ").slice(0, 200) ?? "";

for (const f of result.unexpected) console.log(`${formatFinding(f)}\n    ${text(f.abilityId)}`);
if (showAll) for (const f of result.allowed) console.log(`ALLOWED ${formatFinding(f)}\n    ${text(f.abilityId)}\n    reason: ${PROGRAM_LINT_ALLOWLIST[f.abilityId]?.reason}`);
for (const id of result.stale) console.log(`STALE allowlist entry ${id}: no finding matches it any more; remove it`);
const unknown = unknownVarFields();
for (const u of unknown) console.log(`UNKNOWN variable-like field "${u.key}" in ${u.cardId} ${u.abilityId}: teach readsOf about it`);

console.log(`${result.unexpected.length} finding(s), ${result.allowed.length} allowlisted, ${result.stale.length} stale allowlist entr${result.stale.length === 1 ? "y" : "ies"}`);
process.exit(result.unexpected.length || result.stale.length || unknown.length ? 1 : 0);
